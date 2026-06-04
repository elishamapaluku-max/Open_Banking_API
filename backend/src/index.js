require('dotenv').config()

const app = require('./app')

const PORT = process.env.PORT || 3000

console.log(`Starting server on PORT: ${PORT}`)

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`KipaAPI server running on http://0.0.0.0:${PORT}`)
})

server.on('error', (err) => {
  console.error('Server error:', err.message)
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
  process.exit(1)
})
