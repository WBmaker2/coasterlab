import './ui/styles/main.css';
import { App } from './app/App';

const root = document.getElementById('app');
if (!root) {
  throw new Error('App root not found.');
}

const app = new App(root);
app.start();
