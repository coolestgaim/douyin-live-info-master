import * as https from 'https'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as logger from './logger'

const LOG_MODULE = 'Tingwu'

export interface OssConfig {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
}

export interface TingwuTaskResult {
  taskStatus: string
  transcription?: string
  summarization?: any
  result?: any
}

// —— HMAC-SHA1 signing (Alibaba Cloud Signature V1) ——
function sign(method: string, params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort()
  const canonicalized = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
  const stringToSign = `${method}&${encodeURIComponent('/')}&${encodeURIComponent(canonicalized)}`
  return crypto.createHmac('sha1', secret + '&').update(stringToSign).digest('base64')
}

function httpRequest(opts: https.RequestOptions, body?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let buf = ''
      res.on('data', (c: Buffer) => buf += c.toString())
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(buf) })
        } catch {
          resolve({ status: res.statusCode || 0, data: buf })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// —— OSS: Upload file via PUT Object ——
export async function uploadToOss(localPath: string, config: OssConfig): Promise<string> {
  const fileName = path.basename(localPath)
  const objectKey = `tingwu-uploads/${Date.now()}_${fileName}`
  const contentType = fileName.endsWith('.mp3') ? 'audio/mpeg'
    : fileName.endsWith('.mp4') ? 'video/mp4'
    : fileName.endsWith('.wav') ? 'audio/wav'
    : 'application/octet-stream'

  const host = `${config.bucket}.${config.region}.aliyuncs.com`
  const date = new Date().toUTCString()
  const fileBuffer = fs.readFileSync(localPath)

  const stringToSign = `PUT\n\n${contentType}\n${date}\n/${config.bucket}/${objectKey}`
  const signature = crypto.createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64')
  const auth = `OSS ${config.accessKeyId}:${signature}`

  logger.info(LOG_MODULE, `Uploading ${fileName} to OSS...`)

  const result = await httpRequest({
    hostname: host,
    port: 443,
    path: `/${objectKey}`,
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length,
      'Date': date,
      'Authorization': auth
    }
  }, fileBuffer as any)

  if (result.status !== 200) {
    throw new Error(`OSS上传失败 (${result.status}): ${JSON.stringify(result.data)}`)
  }

  // Generate signed URL (valid for 4 hours)
  const expireTime = Math.floor(Date.now() / 1000) + 14400
  const signStr = `GET\n\n\n${expireTime}\n/${config.bucket}/${objectKey}`
  const urlSig = encodeURIComponent(crypto.createHmac('sha1', config.accessKeySecret).update(signStr).digest('base64'))
  const signedUrl = `https://${host}/${objectKey}?OSSAccessKeyId=${config.accessKeyId}&Expires=${expireTime}&Signature=${urlSig}`

  logger.info(LOG_MODULE, `Upload complete: ${signedUrl.substring(0, 80)}...`)
  return signedUrl
}

// —— Tingwu: Create transcription task ——
export async function createTranscriptionTask(
  fileUrl: string,
  accessKeyId: string,
  accessKeySecret: string
): Promise<string> {
  const endpoint = 'tingwu.cn-beijing.aliyuncs.com'
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = Math.random().toString(36).substring(2, 15)

  const queryParams: Record<string, string> = {
    Format: 'JSON',
    Version: '2023-09-30',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: timestamp,
    SignatureVersion: '1.0',
    SignatureNonce: nonce
  }

  const signature = sign('POST', queryParams, accessKeySecret)
  const queryString = Object.keys(queryParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&')
    + `&Signature=${encodeURIComponent(signature)}`

  const body = JSON.stringify({
    AppKey: 'tingwu',
    Input: {
      FileUrl: fileUrl,
      SourceLanguage: 'cn',
      TaskKey: `task_${Date.now()}`
    },
    Parameters: {
      Transcription: {
        DiarizationEnabled: true,
        Diarization: { SpeakerCount: 0 }
      },
      SummarizationEnabled: true,
      Summarization: {
        Types: ['ParagraphSummary', 'ConversationalSummary', 'ChapterSummary']
      }
    }
  })

  logger.info(LOG_MODULE, `Creating Tingwu task...`)

  const result = await httpRequest({
    hostname: endpoint,
    port: 443,
    path: `/openapi/tingwu/v2/tasks?${queryString}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body)

  if (result.status !== 200 || !result.data?.Data?.TaskId) {
    throw new Error(`创建任务失败 (${result.status}): ${JSON.stringify(result.data)}`)
  }

  const taskId = result.data.Data.TaskId
  logger.info(LOG_MODULE, `Task created: ${taskId}`)
  return taskId
}

// —— Tingwu: Get task result ——
export async function getTaskResult(
  taskId: string,
  accessKeyId: string,
  accessKeySecret: string
): Promise<TingwuTaskResult> {
  const endpoint = 'tingwu.cn-beijing.aliyuncs.com'
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = Math.random().toString(36).substring(2, 15)

  const queryParams: Record<string, string> = {
    Format: 'JSON',
    Version: '2023-09-30',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: timestamp,
    SignatureVersion: '1.0',
    SignatureNonce: nonce,
    TaskId: taskId
  }

  const signature = sign('GET', queryParams, accessKeySecret)
  const queryString = Object.keys(queryParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&')
    + `&Signature=${encodeURIComponent(signature)}`

  const result = await httpRequest({
    hostname: endpoint,
    port: 443,
    path: `/openapi/tingwu/v2/tasks/${taskId}?${queryString}`,
    method: 'GET'
  })

  if (result.status !== 200) {
    return { taskStatus: 'FAILED' }
  }

  const data = result.data?.Data || result.data
  return {
    taskStatus: data?.TaskStatus || 'UNKNOWN',
    result: data?.Result,
    transcription: data?.Result?.Transcription,
    summarization: data?.Result?.Summarization
  }
}
