import type { NextConfig } from "next";
// import path from 'path';

const nextConfig: NextConfig = {
    // Recommended: this will reduce output
    // Docker image size by 80%+
    output: "standalone",
    // Optional: bring your own cache handler
    // cacheHandler: path.resolve('./cache-handler.mjs'),
    // cacheMaxMemorySize: 0, // Disable default in-memory caching
    images: {
        // Optional: use a different optimization service
        // loader: 'custom',
        // loaderFile: './image-loader.ts',
        //
        // We're defaulting to optimizing images with
        // Sharp, which is built-into `next start`
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com",
                port: "",
                pathname: "/**",
                search: "",
            },
        ],
    },
    // Nginx will do gzip compression. We disable
    // compression here so we can prevent buffering
    // streaming responses
    compress: false,

    experimental: {
        // Enable tree-shaking for mantine
        optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
        // Improve resource loading
        optimizeCss: true,
        // PPR is only available in canary versions, so removing it
        // ppr: true,
    },

    // Optimize performance through better caching and fewer redirects
    poweredByHeader: false,
    reactStrictMode: true,

    // Enhanced static optimization
    staticPageGenerationTimeout: 120,
};

export default nextConfig;
