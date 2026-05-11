import { mkdir, access } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import gm from 'gm'
import isImage from 'is-image'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

type ResizeModifier = '!' | '>'

export interface Image {
	absolutePath: string
	absoluteThumbnailPath: string
	modifier: ResizeModifier
	width: number
	height: number
	callback?: (error: Error | null, absoluteThumbnailPath?: string) => void
}

export interface MiddlewareOptions {
	thumbnailsPath?: string
	basePath?: string
}

interface Worker {
	id: number
	image: Image
}

const cpus = os.cpus()
const idleQueue: Image[] = []
const workers: Worker[] = []

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath)
		return true
	}
	catch {
		return false
	}
}

function writeThumbnail(image: Image): Promise<void> {
	return new Promise((resolve, reject) => {
		gm(image.absolutePath)
			.autoOrient()
			.resize(image.width, image.height, image.modifier)
			.noProfile()
			.write(image.absoluteThumbnailPath, (error) => {
				if (error) reject(error)
				else resolve()
			})
	})
}

async function convert(image: Image): Promise<void> {
	await mkdir(path.dirname(image.absoluteThumbnailPath), { recursive: true })

	if (await fileExists(image.absoluteThumbnailPath)) return

	await writeThumbnail(image)
}

async function workOffQueue(worker: Worker): Promise<void> {
	let current: Image | undefined = worker.image

	while (current) {
		try {
			await convert(current)
			console.log(
				'Thumbnail:',
				current.absolutePath, '->', current.absoluteThumbnailPath,
			)
			current.callback?.(null, current.absoluteThumbnailPath)
		}
		catch (error) {
			current.callback?.(error as Error)
		}

		current = idleQueue.pop()
		if (current) worker.image = current
	}

	workers.splice(workers.indexOf(worker), 1)
}

function addWorker(): void {
	const currentImage = idleQueue.pop()
	if (!currentImage) return

	const worker: Worker = {
		id: Date.now(),
		image: currentImage,
	}

	workers.push(worker)
	workOffQueue(worker).catch((error) => console.error(error))
}

export function addToQueue(image: Image): void {
	const inQueue = idleQueue
		.some((img) => img.absolutePath === image.absolutePath)
	const beingProcessed = workers
		.some((w) => w.image.absolutePath === image.absolutePath)

	if (inQueue || beingProcessed) return

	idleQueue.push(image)

	if (workers.length < cpus.length) addWorker()
}

export function getMiddleware(
	options: MiddlewareOptions = {},
): RequestHandler {
	const thumbnailsPath = options.thumbnailsPath
		?? path.join(process.cwd(), 'thumbs')
	const basePath = options.basePath

	console.assert(basePath, 'BasePath is not specified')

	return (request: Request, response: Response, next: NextFunction): void => {
		const host = request.headers.host ?? 'localhost'
		const fileUrl = new URL(request.url, `http://${host}`)
		const fileExtension = path.extname(fileUrl.pathname)
		const width = Number(fileUrl.searchParams.get('width'))
		const height = Number(fileUrl.searchParams.get('height'))
		const maxWidth = Number(fileUrl.searchParams.get('max-width'))
		const maxHeight = Number(fileUrl.searchParams.get('max-height'))

		// Skip middleware if not an image or no size parameter is set
		if (
			!isImage(fileUrl.pathname) ||
			!(width || height || maxWidth || maxHeight)
		) {
			next()
			return
		}

		const calculatedWidth = maxWidth || width
		const calculatedHeight = maxHeight || height
		const modifier: ResizeModifier = (maxWidth || maxHeight) ? '>' : '!'

		const thumbnailPath = fileUrl.pathname
			.replace(new RegExp(`${fileExtension}$`), '')
			+ `_${calculatedWidth}x${calculatedHeight}${modifier}${fileExtension}`

		const image: Image = {
			absolutePath: path.join(basePath!, fileUrl.pathname),
			absoluteThumbnailPath: path.join(thumbnailsPath, thumbnailPath),
			modifier,
			width: calculatedWidth,
			height: calculatedHeight,
			callback: (error, absoluteThumbnailPath) => {
				if (error) {
					next(error)
					return
				}
				if (absoluteThumbnailPath) {
					createReadStream(absoluteThumbnailPath).pipe(response)
				}
			},
		}

		const stream = createReadStream(image.absoluteThumbnailPath)

		stream.on('error', (error: NodeJS.ErrnoException) => {
			if (error.code !== 'ENOENT') {
				next(error)
				return
			}

			// Create thumbnail if it does not exist yet
			addToQueue(image)
		})

		stream.pipe(response)
	}
}
