window.play = () => { document.getElementById('lower-third').style.display = 'flex'; };
window.stop = () => { document.getElementById('lower-third').style.display = 'none'; };
window.update = (data) => {
  const values = typeof data === 'string' ? JSON.parse(data) : data;
  for (const key of ['f0', 'f1']) if (typeof values[key] === 'string') document.getElementById(key).textContent = values[key];
};
