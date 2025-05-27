const ngrok = require('ngrok');

async function start() {
  const port = process.env.PORT;
  const url = await ngrok.connect(port);
  console.log('Ngrok URL:', url);

  process.env.NGROK_URL = url;

  require('./index');
}

start();