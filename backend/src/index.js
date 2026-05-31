import app from './app.js'

const PORT = process.env.PORT

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KipaAPI server running on port ${PORT}`)
})
