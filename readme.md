# Image Resizer

Sharp powered, multi-threaded image resizing middleware.


## Installation

```sh
npm install image-resizer-middleware
```


## Usage

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getMiddleware } from 'image-resizer-middleware'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = 3000
const publicDirectory = path.join(__dirname, 'public')

const app = express()

app.use(getMiddleware({
	basePath: publicDirectory,
	thumbnailsPath: path.join(publicDirectory, 'thumbnails'),
}))
app.use(express.static(publicDirectory))

app.listen(
	port,
	() => console.log(`Listening on http://localhost:${port}`),
)
```

Every request for an image under `basePath`
which also contains a width, height, max-width or max-height query parameter
will be scaled to the specified value.

For example a request for
`http://localhost:3000/images/test.png?max-width=50&max-height=50`
triggers the creation of a proportionally scaled thumbnail
with a maximum bounding box of 50px by 50px.
It is saved at `$(pwd)/public/thumbnails/images/test_50x50>.png`
and responded to the request.


## Algorithm

All images to be scaled are added to a queue.
The queue is worked off with one worker per core.
