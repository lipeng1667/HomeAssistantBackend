import axios from 'axios';
import chalk from 'chalk';
import Table from 'cli-table3';

const API_URL = 'http://localhost:10000/api/cli-stats';

function clear() {
  process.stdout.write('\x1Bc');
}

async function render() {
  try {
    const res = await axios.get(API_URL);
    const { totalRequests, perPath, uptime, activeConnections } = res.data;
    clear();
    console.log(chalk.bold.green('=== Node.js API CLI Dashboard ==='));
    console.log('Uptime:', chalk.yellow(`${uptime}s`));
    console.log('Total Requests:', chalk.cyan(totalRequests));
    console.log('Active HTTP Connections:', chalk.blue(activeConnections));
    console.log('');

    // Table for requests per endpoint
    const table = new Table({
      head: [chalk.magenta('API Endpoint'), chalk.magenta('Requests')],
      colWidths: [40, 15]
    });

    Object.entries(perPath).forEach(([path, count]) => {
      table.push([chalk.white(path), chalk.yellow(count)]);
    });

    console.log(table.toString());
    console.log('\n(Refreshes every 2 seconds)');
  } catch (err) {
    clear();
    console.log(chalk.red('Error fetching stats!'), err.message);
  }
}

setInterval(render, 2000);
render();