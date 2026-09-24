import { createApp } from './app';

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`PraGaTi Setu API listening on http://localhost:${port}`);
  if (process.env.DEMO_MODE === 'true') console.log('DEMO_MODE on — one-click role switching enabled');
});
