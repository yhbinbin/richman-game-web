import fs from 'fs';

let content = fs.readFileSync('src/handlers/CardHandler.js', 'utf8');
console.log(content);
