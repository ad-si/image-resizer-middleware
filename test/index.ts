import http from 'node:http'
import startServer from './server.ts'

const port = 3000

startServer(port, () => {
	const maxWidth = 50
	const maxHeight = 50

	http
		.get(
			{
				path: `/apple.png?max-width=${maxWidth}&max-height=${maxHeight}`,
				port,
			},
			(response) => {
				response.on('data', (data: Buffer) => {
					const actual = data.length
					const expected = 2076
					console.assert(
						actual === expected,
						`actual: ${actual}\nexpected: ${expected}`,
					)
				})
				response.on('end', () => process.exit(0))
				response.on('error', (error) => console.error(error))
			},
		)
		.on('error', (error) => {
			console.error(error.stack)
			process.exit(1)
		})
})
