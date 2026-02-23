const withNextIntl = require('next-intl/plugin')(
  './i18n.ts'
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Temporarily disable experimental features to avoid Turbopack errors
  // experimental: {
  //   optimizePackageImports: ['next-intl'],
  // },
}

module.exports = withNextIntl(nextConfig)


