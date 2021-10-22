var shell = require('shelljs');

async function main() {

var DDI = 1110933
var ssoUsername = "rahu4105"
var ssoToken = 57444419

var accountsListCommnad = 'faws --no-interactive --rackspace-account ' + DDI + ' --user ' + ssoUsername + ' --token ' + ssoToken + ' account list-accounts --json'
console.log(accountsListCommnad);

var accountsListCommnadResult = shell.exec(accountsListCommnad)

console.log(accountsListCommnadResult);

}

main()