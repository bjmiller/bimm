import { resolve } from 'node:path';
import type webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import HtmlInlineScriptPlugin from 'html-inline-script-webpack-plugin';
import HtmlInlineCssPlugin from 'html-inline-css-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const aggregateTimeout = 200;

const mainConfig: webpack.Configuration = {
  mode: 'production',
  target: 'electron-main',
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: ['ts-loader']
      }
    ]
  },
  resolve: { extensions: ['', '.ts', '.js', '...'] },
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'index.js'
  },
  optimization: {
    minimize: false
  },
  plugins: [new CopyWebpackPlugin({ patterns: [{ from: 'src/icons', to: 'icons' }] })],
  watch: true,
  watchOptions: {
    aggregateTimeout
  }
};

const preloadConfig: webpack.Configuration = {
  mode: 'production',
  target: 'electron-preload',
  entry: './src/preload.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: ['ts-loader']
      }
    ]
  },
  resolve: { extensions: ['', '.ts', '.js', '...'] },
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'preload.js'
  },
  optimization: {
    minimize: false
  },
  watch: true,
  watchOptions: {
    aggregateTimeout
  }
};

const pageConfig: webpack.Configuration = {
  mode: 'production',
  target: 'electron-renderer',
  entry: './src/renderer/page.tsx',
  module: {
    rules: [
      {
        test: /\.ts$|\.tsx$/,
        include: /src/,
        use: ['ts-loader']
      },
      {
        test: /\.css$/,
        include: /src/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
      },
      {
        test: /\.less$/,
        include: /src/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader', 'less-loader']
      },
      {
        test: /\.svg$/,
        type: 'asset/inline'
      }
    ]
  },
  resolve: { extensions: ['', '.ts', '.tsx', '.js', '.svg', '...'] },
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'main.js'
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css'
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      cache: false
    }),
    new HtmlInlineScriptPlugin(),
    new HtmlInlineCssPlugin({ leaveCSSFile: false })
  ],
  watch: true,
  watchOptions: {
    aggregateTimeout
  }
};

export default [mainConfig, preloadConfig, pageConfig];
