const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let width, height;
let stars = [];
const numStars = 400;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  initStars();
}

function initStars() {
  stars = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.2 + 0.3, // very small stars
      o: Math.random() * 0.5 + 0.1, // lower base opacity
      speedO: (Math.random() * 0.01) - 0.005, // slower twinkling
      speedY: (Math.random() * 0.1) + 0.05 // slow upward drift
    });
  }
}

function animate() {
  ctx.clearRect(0, 0, width, height);
  
  for (let i = 0; i < numStars; i++) {
    let s = stars[i];
    
    // Twinkle
    s.o += s.speedO;
    if (s.o <= 0.1 || s.o >= 0.7) s.speedO *= -1;
    
    // Drift slowly upwards
    s.y -= s.speedY;
    if (s.y < 0) s.y = height;
    
    // Draw
    ctx.beginPath();
    ctx.fillStyle = `rgba(226, 232, 240, ${s.o})`; // subtle white/slate color
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);
resize();
animate();
