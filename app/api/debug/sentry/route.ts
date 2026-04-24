import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function GET() {
  try {
    throw new Error('Deliberate Sentry test error')
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json({ status: 'captured' }, { status: 500 })
  }
}
