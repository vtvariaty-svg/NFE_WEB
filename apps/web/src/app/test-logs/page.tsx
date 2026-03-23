'use client';
import { useEffect, useState } from 'react';

export default function TestLogs() {
  const [data, setData] = useState('Loading...');
  
  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
    fetch(`${API_URL}/api/test-logs`)
      .then(res => res.text())
      .then(text => setData(text))
      .catch(err => setData('Error: ' + err.message));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Logs do backend</h1>
      <pre>{data}</pre>
    </div>
  );
}
