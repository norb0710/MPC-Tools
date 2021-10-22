var shell = require('shelljs');

/**
 * 
 * Description: This function uses the FAWS CLI to return the temporary credentials for all the AWS accounts under the provided DDI.
 * 
 * @param {*} DDI 
 * @param {*} ssoUsername 
 * @param {*} ssoToken 
 */
function extractCredentials(DDI, ssoUsername, ssoToken){

    var credsMap = new Map()

    var accountsListCommnad = "faws --rackspace-account " + DDI + " --user " + ssoUsername + " account list-accounts --json"
    var accountsListCommnadResult = shell.exec(accountsListCommnad)

    var parsedAccountsJson = JSON.parse(accountsListCommnadResult)

    // Get creds for each AWS account
    parsedAccountsJson.awsAccounts.forEach(accountObject => {
        var resultsCreds = shell.exec("faws --rackspace-account " + DDI + " --user " + ssoUsername + " env -a " + accountObject.awsAccountNumber + " --json")                
        var resultsCredsJson = JSON.parse(resultsCreds)

        credsMap.set(accountObject.name, 
            {accessKey: resultsCredsJson.credential.accessKeyId, 
            secertAccessKey: resultsCredsJson.credential.secretAccessKey, 
            sessionToken: resultsCredsJson.credential.sessionToken,
            accountNumber: accountObject.awsAccountNumber
        })

    })    

    return credsMap

}

module.exports = { extractCredentials }