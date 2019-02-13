const path = require('path');

module.exports = {
  mode: 'development',
  entry: './services/extensions/scripts/browser-api/src/index.js',
  output: {
    path: path.join(__dirname, 'services', 'extensions', 'scripts', 'browser-api', 'dist'),
    filename: 'browser-api.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [ '@babel/preset-env' ]
            }
          }
        ]
      }
    ]
  },
  devtool: 'source-map'
};
