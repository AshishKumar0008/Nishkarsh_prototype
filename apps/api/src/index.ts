import { productionConfigProblems } from './core/config';
import { createApp } from './app';
import { bootstrapDemoData } from './core/bootstrap';

const problems = productionConfigProblems(process.env);
if (problems.length) {
  console.error('Refusing to start — fix the configuration first:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`Nishkarsh API listening on port ${port}`);
  if (process.env.DEMO_MODE === 'true') console.log('DEMO_MODE on — one-click role switching enabled (fictional data only)');
  bootstrapDemoData(port).catch((e) => console.error('AUTO_SEED failed:', e));
});
