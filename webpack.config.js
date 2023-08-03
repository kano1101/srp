import webpack from 'webpack';
import path from 'path';
import Dotenv from 'dotenv-webpack';
// import dotenv from 'dotenv';

import { fileURLToPath } from 'url';

// const env = dotenv.config().parsed;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    mode: 'production',

    entry: './src/main.ts',

    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
            },
        ],
    },
    resolve: {
        modules: [
            path.resolve(__dirname, ""),
            "node_modules"
        ],
        extensions: [
            '.ts', '.js',
        ],
        fallback: {
            path: false,
            os: false,
            fs: false
        },
        // alias: {
        //     'path': 'path-browserify',
        //     'os': 'os-browserify',
        // }
    },

    // target: 'web',
    // web: {
    //     __dirname: false,
    //     __filename: false,
    //     global: true
    // },
    plugins: [
        // new webpack.DefinePlugin({
        //     'process.env': JSON.stringify(env),
        // }),
        new Dotenv()
    ],
};

export default config;
