const { inspect } = require('util');
/**
 * super tiny testing framework
 * 
 * @author Liu song <hi@lsong.org>
 * @github https://github.com/song940
 */
const test = async (title, fn) => {
  try {
    await fn();
    console.log(color(` ✔  ${title}`, 32));
  } catch (err) {
    console.error(color(` ✘  ${title}`, 31));
    console.log();
    console.log(color(`   ${err.name}: ${err.message}`, 31));
    console.error(color(`   expected: ${inspect(err.expected)}`, 32));
    console.error(color(`     actual: ${inspect(err.actual)}`, 31));
    console.log();
    process.exit(1);
  }
};

function color(str, c) {
  return "\x1b[" + c + "m" + str + "\x1b[0m";
};

module.exports = test;