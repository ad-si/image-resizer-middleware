import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getMiddleware } from '../src/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const basePath = __dirname
const thumbnailsPath = path.join(__dirname, 'thumbnails')

export default function startServer(
	port: number,
	isListeningCallback: () => void,
): void {
	const app = express()

	app.use(getMiddleware({ basePath, thumbnailsPath }))
	app.use(express.static(__dirname))

	app.listen(port, () => {
		console.log(`Test app is listening on http://localhost:${port}`)
		isListeningCallback()
	})
}
