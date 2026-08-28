import { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },

  // src/ lives one level above app/. Without this, Turbopack treats app/ as the
  // workspace root and can fail to bundle the engine + three correctly.
  turbopack: {
    root: path.resolve(__dirname, '..')
  },

  serverExternalPackages: ['@cursor/sdk'],

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'framer-motion',
      'sonner',
      'zustand'
    ]
  },

  images: {
    unoptimized:true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn-images.archybase.com',
        pathname: '**'
      }
    ]
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
      '@blueprint3d': path.resolve(__dirname, '../src'),
      // Resolve three.js and animejs from app's node_modules
      // (src/ is outside app/ so webpack needs an explicit path)
      'three': path.resolve(__dirname, 'node_modules/three'),
      'animejs': path.resolve(__dirname, 'node_modules/animejs')
    }
    // Let webpack resolve modules from app's node_modules for files outside app/
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      'node_modules'
    ]

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false
      }
    }

    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        'three'
      ]
    }

    return config
  }
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
export default withNextIntl(nextConfig)
