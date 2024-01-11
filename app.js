const { Porcupine } = require("@picovoice/porcupine-node")
const { PvRecorder } = require("@picovoice/pvrecorder-node")
const vosk = require('vosk')

const porcupine = new Porcupine(
  "IQMBIjWkICw9/z7zT3wjTMUEDMCgaqDHknD3hkqqFVh49Hxvx2pgBQ==",
  ['./word.ppn'],
  [0.5],
  './porcupine_params_ru.pv'
)

const devices = PvRecorder.getAvailableDevices()
for (let i = 0;i < devices.length;i++) {
  console.log(`index: ${i}, device name: ${devices[i]}`)
}

let isInterrupted = false
const recorder = new PvRecorder(512, -1)

const model = new vosk.Model('./vosk-model-small-ru-0.22') // Замените на путь к вашей модели Vosk
const sampleRate = 16000 // Задайте правильную частоту дискретизации, если она отличается
const recognizer = new vosk.Recognizer({ model, sampleRate })

function compareTwoStrings(first, second) {
  first = first.replace(/\s+/g, '')
  second = second.replace(/\s+/g, '')

  if (first === second) return 1 // identical or empty
  if (first.length < 2 || second.length < 2) return 0 // if either is a 0-letter or 1-letter string

  let firstBigrams = new Map()
  for (let i = 0;i < first.length - 1;i++) {
    const bigram = first.substring(i, i + 2)
    const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1

    firstBigrams.set(bigram, count)
  }

  let intersectionSize = 0
  for (let i = 0;i < second.length - 1;i++) {
    const bigram = second.substring(i, i + 2)
    const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0

    if (count > 0) {
      firstBigrams.set(bigram, count - 1)
      intersectionSize++
    }
  }

  return (2.0 * intersectionSize) / (first.length + second.length - 2)
}

async function recognizeSpeech(audioBuffer) {
  recognizer.acceptWaveform(audioBuffer)
  let findCommand = false
  const text = recognizer.finalResult().text

  if (compareTwoStrings(text, 'погода') > 0.5) {
    let weather = await fetch('https://api.open-meteo.com/v1/forecast?latitude=53.2001&longitude=50.15&current=apparent_temperature&timezone=auto&forecast_days=1')
    weather = await weather.json()
    console.log(`Погода ${weather.current.apparent_temperature}°C`)
    findCommand = true
  }

  return findCommand
}

async function start() {
  recorder.start()
  while (true) {
    const frame = await recorder.read()
    const index = porcupine.process(frame)
    if (index !== -1) {
      console.log(`КАМЕНЬ слушает...`)

      isInterrupted = true
      const frames = []
      let timeOut = setTimeout(() => {
        console.log('Time out')
        isInterrupted = false
      }, 5 * 1000)

      while (isInterrupted) {
        const frame = await recorder.read()
        frames.push(frame)

        const audioData = new Int16Array(recorder.frameLength * frames.length)
        frames.forEach((fragment, i) => {
          audioData.set(fragment, i * recorder.frameLength)
        })
        if (await recognizeSpeech(audioData)) {
          clearTimeout(timeOut)
          isInterrupted = false
        }
      }

    }
  }
}

start()
console.log(`Listening for 'КАМЕНЬ'...`)
process.stdin.resume()
console.log("Press ctrl+c to exit.")