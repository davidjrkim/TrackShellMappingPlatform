import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {}

const sentryBuildOptions = {
  silent: true,
}

export default withSentryConfig(nextConfig, sentryBuildOptions)
