import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

    // Increase timeout for static generation to avoid errors
    staticPageGenerationTimeout: 180,
};

const withNextIntl = createNextIntlPlugin({
    requestConfig: "./app/i18n/request.ts", // Specify the custom path to the request config
    experimental: {
        // Provide the path to the messages that you're using in `AppConfig`
        createMessagesDeclaration: "./messages/en.json",
    },
});
export default withNextIntl(nextConfig);
