"use client"

import { supabase } from "@/lib/supabase"

export type DraftPhoto = {
  id: string
  draft_id: string
  storage_path: string
  caption: string | null
  taken_at: string | null
  created_at: string
  signedUrl?: string
}

const BUCKET = "site-visit-photos"
const MAX_EDGE_PX = 800
const JPEG_QUALITY = 0.85

export async function resizeImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { width, height } = img
      const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height))
      const canvasWidth = Math.round(width * scale)
      const canvasHeight = Math.round(height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = canvasWidth
      canvas.height = canvasHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas not supported"))
        return
      }

      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Canvas toBlob failed"))
        },
        "image/jpeg",
        JPEG_QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Image load failed"))
    }

    img.src = objectUrl
  })
}

export async function uploadDraftPhoto(
  draftId: string,
  file: File,
): Promise<{ ok: boolean; message: string; photo?: DraftPhoto }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, message: userError?.message ?? "Sign in to upload photos." }
  }

  let blob: Blob
  try {
    blob = await resizeImageFile(file)
  } catch {
    return { ok: false, message: "Could not resize image before upload." }
  }

  const storagePath = `${user.id}/${draftId}/${Date.now()}-site.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert: false,
    })

  if (uploadError) {
    return { ok: false, message: uploadError.message }
  }

  const { data: row, error: insertError } = await supabase
    .from("draft_photos")
    .insert({ draft_id: draftId, user_id: user.id, storage_path: storagePath })
    .select("id, draft_id, storage_path, caption, taken_at, created_at")
    .single()

  if (insertError) {
    return { ok: false, message: insertError.message }
  }

  const { data: signedData } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  return {
    ok: true,
    message: "Photo uploaded.",
    photo: { ...(row as DraftPhoto), signedUrl: signedData?.signedUrl ?? undefined },
  }
}

export async function loadDraftPhotos(draftId: string): Promise<DraftPhoto[]> {
  const { data, error } = await supabase
    .from("draft_photos")
    .select("id, draft_id, storage_path, caption, taken_at, created_at")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: true })

  if (error || !data) return []

  const photos: DraftPhoto[] = []

  for (const row of data as DraftPhoto[]) {
    const { data: signedData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 3600)

    photos.push({ ...row, signedUrl: signedData?.signedUrl ?? undefined })
  }

  return photos
}

export async function deleteDraftPhoto(
  photoId: string,
  storagePath: string,
): Promise<{ ok: boolean; message: string }> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath])

  if (storageError) {
    return { ok: false, message: storageError.message }
  }

  const { error: dbError } = await supabase.from("draft_photos").delete().eq("id", photoId)

  if (dbError) {
    return { ok: false, message: dbError.message }
  }

  return { ok: true, message: "Photo deleted." }
}

export async function loadDraftPhotoCountsForDrafts(
  draftIds: string[],
): Promise<Record<string, number>> {
  if (draftIds.length === 0) return {}

  const { data, error } = await supabase
    .from("draft_photos")
    .select("draft_id")
    .in("draft_id", draftIds)

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const row of data as { draft_id: string }[]) {
    counts[row.draft_id] = (counts[row.draft_id] ?? 0) + 1
  }
  return counts
}
