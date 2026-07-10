import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/api-auth"

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe"

function getAudioFileName(file: File) {
  if (file.name && file.name !== "blob") return file.name
  if (file.type.includes("mp4")) return "recording.mp4"
  if (file.type.includes("ogg")) return "recording.ogg"
  return "recording.webm"
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return auth.response

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const formData = await request.formData()
    const audio = formData.get("audio")

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "No audio file was provided." }, { status: 400 })
    }

    const openAiFormData = new FormData()
    openAiFormData.append("model", TRANSCRIPTION_MODEL)
    openAiFormData.append("response_format", "json")
    openAiFormData.append("file", audio, getAudioFileName(audio))

    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: openAiFormData,
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        typeof result?.error?.message === "string"
          ? result.error.message
          : "OpenAI transcription request failed."

      return NextResponse.json({ error: message }, { status: response.status })
    }

    if (typeof result?.text !== "string") {
      return NextResponse.json({ error: "OpenAI did not return transcript text." }, { status: 502 })
    }

    return NextResponse.json({ transcript: result.text })
  } catch {
    return NextResponse.json({ error: "Unexpected transcription error." }, { status: 500 })
  }
}
