import { render } from 'preact';
import './core/styles/tokens.css';
import './core/styles/base.css';
import { App } from './app';

const root = document.getElementById('app');
if (root) render(<App />, root);
