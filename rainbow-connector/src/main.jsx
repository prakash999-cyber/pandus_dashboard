import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

function init() {
  const container = document.getElementById('rainbow-wallet-container');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } else {
    setTimeout(init, 50);
  }
}

init();
