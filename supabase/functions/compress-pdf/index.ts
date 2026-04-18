import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // Verify user authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Получаем PDF файл из тела запроса
    const formData = await req.formData()
    const file = formData.get('file') as File
    const quality = formData.get('quality') as string || 'ebook' // screen, ebook, printer

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ success: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB` }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate quality parameter
    const allowedQualities = ['screen', 'ebook', 'printer'];
    const safeQuality = allowedQualities.includes(quality) ? quality : 'ebook';

    console.log(`Compressing PDF: ${file.name}, size: ${file.size} bytes, quality: ${safeQuality}`)

    // Читаем содержимое PDF
    const pdfBytes = await file.arrayBuffer()
    const originalSize = pdfBytes.byteLength

    // Создаём временные файлы
    const inputPath = `/tmp/input_${Date.now()}.pdf`
    const outputPath = `/tmp/output_${Date.now()}.pdf`

    // Сохраняем входной файл
    await Deno.writeFile(inputPath, new Uint8Array(pdfBytes))

    // Определяем настройки качества
    const qualitySettings: Record<string, string> = {
      'screen': '/screen',    // 72dpi - максимальное сжатие
      'ebook': '/ebook',      // 150dpi - баланс качества и размера
      'printer': '/printer'   // 300dpi - высокое качество
    }

    const pdfSettings = qualitySettings[safeQuality] || '/ebook'

    // Запускаем Ghostscript для сжатия
    const command = new Deno.Command("gs", {
      args: [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        `-dPDFSETTINGS=${pdfSettings}`,
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-r150",
        `-sOutputFile=${outputPath}`,
        inputPath
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const process = await command.output();

    if (!process.success) {
      const stderr = new TextDecoder().decode(process.stderr)
      console.error('Ghostscript error:', stderr)
      throw new Error(`Ghostscript failed: ${stderr}`)
    }

    // Читаем сжатый файл
    const compressedBytes = await Deno.readFile(outputPath)
    const compressedSize = compressedBytes.byteLength

    // Вычисляем процент экономии
    const savings = Math.round(((originalSize - compressedSize) / originalSize) * 100)

    console.log(`Compression complete: ${originalSize} -> ${compressedSize} bytes (${savings}% savings)`)

    // Удаляем временные файлы
    try {
      await Deno.remove(inputPath)
      await Deno.remove(outputPath)
    } catch (e) {
      console.error('Error removing temp files:', e)
    }

    // Проверяем, есть ли экономия
    if (savings < 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'insufficient_savings',
          message: `Экономия меньше 5% (${savings}%)`,
          originalSize,
          compressedSize,
          savings
        }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
        }
      )
    }

    // Возвращаем сжатый PDF с метаданными
    return new Response(
      compressedBytes,
      {
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/pdf',
          'X-Original-Size': originalSize.toString(),
          'X-Compressed-Size': compressedSize.toString(),
          'X-Savings-Percent': savings.toString()
        }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'PDF compression failed'
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      }
    )
  }
})