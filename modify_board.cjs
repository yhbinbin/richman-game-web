const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/data/board.json'));

let cellsInPath = data.path.map(p => ({p, cell: data.cells[p.y][p.x]}));

for (let item of cellsInPath) {
  if (item.cell.type === 'start' || item.cell.name === '转角') {
    item.cell.type = 'gain_points';
    item.cell.name = '获得点券';
    item.cell.amount = 10;
  }
}

let fcF = cellsInPath.findIndex(i => i.cell.name === '风车F');
let gain50 = cellsInPath.findIndex(i => i.cell.name === '获得点券' && i.cell.amount === 50);
if (fcF >= 0 && gain50 >= 0) {
  const temp = data.cells[cellsInPath[fcF].p.y][cellsInPath[fcF].p.x];
  data.cells[cellsInPath[fcF].p.y][cellsInPath[fcF].p.x] = data.cells[cellsInPath[gain50].p.y][cellsInPath[gain50].p.x];
  data.cells[cellsInPath[gain50].p.y][cellsInPath[gain50].p.x] = temp;
  cellsInPath = data.path.map(p => ({p, cell: data.cells[p.y][p.x]}));
}

let currentStreetId = 1;
let prevIsRoad = false;
let length = cellsInPath.length;
for (let i = 0; i < length; i++) {
  const cell = cellsInPath[i].cell;
  if (cell.type === 'road') {
    if (!prevIsRoad) {
       cell.streetId = currentStreetId++;
    } else {
       cell.streetId = currentStreetId - 1;
    }
    prevIsRoad = true;
  } else {
    prevIsRoad = false;
  }
}
if (cellsInPath[0].cell.type === 'road' && cellsInPath[length-1].cell.type === 'road') {
   cellsInPath[0].cell.streetId = cellsInPath[length-1].cell.streetId;
}

fs.writeFileSync('public/data/board.json', JSON.stringify(data, null, 2));
console.log('Board updated.');