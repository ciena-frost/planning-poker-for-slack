'use strict'

const _ = require('lodash')
const UserRating = require('./model/user-rating')
const IN_CHANNEL = 'in_channel'
const EPHEMERAL = 'ephemeral'
const token = require('./config/auth.json').access_token
let util = require('./util')

/**
 * @typedef {Object} pokerbot
 * @property {Object} pokerDataModel - Has a key as jira-id and value as object having poker details
   e.g {"JIRA-1234":{"channelId":"server","craetedOn":"12121212",userId1:{UserRating1}}}
 * @property {Object} allUsersInTeam - Has a key as user-id and value containing an object containg the info of user
  */
let pokerbot = {}
pokerbot.pokerDataModel = {}
pokerbot.allUsersInTeam = {}

/**
 * We have received a request to start or stop the poker planning
 * @param {Object} req - request object of the express module
 * @param {Object} res -  response object of the express module
 * @param {Object} next - next object of the express module
 * @returns {Object} - response object of the express module
*/
pokerbot.root = function (req, res, next) {
  console.log('Option root : begin')
  const requestBodyTextArray = req.body.text.split(' ')
  const option = requestBodyTextArray[0] ? requestBodyTextArray[0] : undefined
  const jiraId = requestBodyTextArray[1] ? requestBodyTextArray[1] : undefined
  const channelId = req.body.channel_id
  console.log('Channel Id  : ' + channelId)
  console.log('Token Id  : ' + token)

  // Bad command syntax.
  const validCommand = _.includes(['start', 'stop', 'status'], option)
  if (!validCommand || jiraId === undefined) {
    console.log('Option wrong : begin')
    let responseForBadRequestFormat = {
      response_type: EPHEMERAL,
      text: 'Please enter the command in correct format e.g. /planning-poker start or stop or status JIRA-1001'
    }
    console.log('Option wrong : end')
    return res.status(200).json(responseForBadRequestFormat)
  }

 // Closing the unstarted Jira Planning.
  if ((option === 'stop' || option === 'status') && (!pokerbot.pokerDataModel.hasOwnProperty(jiraId))) {
    console.log('Option stop : begin')
    let responseForUnstartedJira = {
      response_type: EPHEMERAL,
      text: 'Planning for this JIRA ID is not started yet.'
    }
    console.log('Option stop : end')
    return res.status(200).json(responseForUnstartedJira)
  }

 // Closing the planning activity.
  if (option === 'stop' && (pokerbot.pokerDataModel.hasOwnProperty(jiraId))) {
    console.log('Option stop : begin')
    console.log(pokerbot.pokerDataModel)
    let pokerModel = pokerbot.pokerDataModel[jiraId]
    let responseText, responseStopRequest
    if (pokerModel.channelId.id !== channelId) {
      responseText = 'This game was not started in this channel.' +
      'Please go to channel ' + pokerModel.channelId.name + ' to stop the game.'
      responseStopRequest = {
        response_type: EPHEMERAL,
        text: responseText
      }
    } else {
      responseText = util.getVotingResult(jiraId, pokerbot.pokerDataModel)
      let unPlayedUserNames = util.getAllUnplayedUersForGame(pokerbot, jiraId)
      if (unPlayedUserNames) {
        responseText = responseText + unPlayedUserNames
      }
      responseText = responseText + '\nThanks for voting.'
      responseStopRequest = {
        response_type: IN_CHANNEL,
        text: responseText
      }
      delete pokerbot.pokerDataModel[jiraId]
    }
    console.log('Option stop : end')
    return res.status(200).json(responseStopRequest)
  }

 // Starting the duplicate jira.
  if (option === 'start' && (pokerbot.pokerDataModel.hasOwnProperty(jiraId))) {
    console.log('Option start : begin')
    console.log(pokerbot.ratingModel)
    let responseDuplicateJira = {
      response_type: EPHEMERAL,
      text: 'Planning for this Jira : ' + jiraId + ' is already in progress'
    }
    return res.status(200).json(responseDuplicateJira)
  }

 // Start the Poker game.
  if (option === 'start' && (!pokerbot.pokerDataModel.hasOwnProperty(jiraId))) {
    let attachment1 = {
      text: '',
      color: '#3AA3E3',
      attachment_type: 'default',
      callback_id: 'planning-poker',
      actions: []
    }
    let attachment2 = {
      text: '',
      color: '#3AA3E3',
      attachment_type: 'default',
      callback_id: 'planning-poker',
      actions: []
    }

    for (var index = 0; index < util.fibonacci.length; index++) {
      let action = {}
      action.name = util.fibonacci[index]
      action.text = util.fibonacci[index]
      action.type = 'button'
      action.value = util.fibonacci[index]
      action.confirm = {
        title: 'Are you sure ?',
        text: 'Are you sure you want to vote ' + util.fibonacci[index] + '  ?',
        ok_text: 'Yes',
        dismiss_text: 'No'
      }
      if (isNaN(util.fibonacci[index])) {
        action.confirm.text = 'Are you sure you want to abstain from voting?'
      }
      if (index < 5) {
        attachment1.actions[attachment1.actions.length] = action
      } else {
        attachment2.actions[attachment2.actions.length] = action
      }
    }
    let currentEpoc = (new Date()).getTime()
    console.log(currentEpoc)
    pokerbot.pokerDataModel[jiraId] = {}
    pokerbot.pokerDataModel[jiraId]['craetedOn'] = currentEpoc
    pokerbot.pokerDataModel[jiraId]['voting'] = {}
    pokerbot.pokerDataModel[jiraId]['channelId'] = {}
    util.getChannelInfo(token, channelId)
    .then((channel) => {
      pokerbot.pokerDataModel[jiraId].channelId['id'] = channel.id
      pokerbot.pokerDataModel[jiraId].channelId['name'] = channel.name
      pokerbot.pokerDataModel[jiraId].channelId['members'] = channel.members.length
      pokerbot.pokerDataModel[jiraId].channelId['membersList'] = []
      pokerbot.pokerDataModel[jiraId].channelId['membersList'] = channel.members
      let missingMembers = _.filter(channel.members, (item) => {
        return (!pokerbot.allUsersInTeam.hasOwnProperty(item))
      })
      if (missingMembers.length > 0) {
        console.log('Information for ' + missingMembers.length + ' members are not present.')
        console.log('Getting the info from slack server')
        pokerbot.addNewUsersInTeam(missingMembers, function () {
          console.log('All users are added.')
        })
      }
      console.log(pokerbot.pokerDataModel)
    })
    .catch((err) => {
      console.error(err)
    })
    let response = {
      response_type: IN_CHANNEL,
      text: 'Please give your poker vote for ' + jiraId,
      attachments: [attachment1, attachment2]
    }
    console.log('Option start : end')
    return res.status(200).json(response)
  }

  // Get the status of game
  if (option === 'status' && (pokerbot.pokerDataModel.hasOwnProperty(jiraId))) {
    console.log('Option status : begin')
    console.log(pokerbot.pokerDataModel)
    let pokerModel = pokerbot.pokerDataModel[jiraId]
    let responseText, responseStopRequest
    if (pokerModel.channelId.id !== channelId) {
      responseText = 'This game was not started in this channel.' +
      'Please go to channel ' + pokerModel.channelId.name + ' to stop or get status of the game.'
      responseStopRequest = {
        response_type: EPHEMERAL,
        text: responseText
      }
    } else {
      responseText = util.getAllUnplayedUersForGame(pokerbot, jiraId)
      responseStopRequest = {
        response_type: IN_CHANNEL,
        text: responseText
      }
    }
    console.log('Option status : end')
    return res.status(200).json(responseStopRequest)
  }
}

/**
 * We have received a vote from user
  * @param {Object} req - request object of the express module
 * @param {Object} res -  response object of the express module
 * @param {Object} next - next object of the express module
 * @returns {Object} - response object of the express module
*/
pokerbot.vote = function (req, res, next) {
  console.log('Option vote : begin')
  const requestBody = JSON.parse(req.body.payload)
  let vote = requestBody.actions[0].value
  const userName = requestBody.user.name
  const userId = requestBody.user.id
  if (isNaN(vote)) {
    vote = 0
  }
  const userRating = new UserRating(userId, userName, vote)
  const jiraId = requestBody.original_message.text.match(/\w+-\d+$/)
  console.log(userName + ' has voted ' + vote + ' for ' + jiraId)
  let responseEphemeral
  if (pokerbot.pokerDataModel[jiraId]) {
    if (!pokerbot.pokerDataModel[jiraId].voting[userId]) {
      pokerbot.pokerDataModel[jiraId].voting[userId] = userRating
      responseEphemeral = {
        response_type: EPHEMERAL,
        text: 'You have voted ' + vote + ' for ' + jiraId,
        replace_original: false
      }
    } else {
      pokerbot.pokerDataModel[jiraId].voting[userId].rating = vote
      responseEphemeral = {
        response_type: EPHEMERAL,
        text: 'You have voted again ' + vote + ' for ' + jiraId,
        replace_original: false
      }
    }

    let votingMap = pokerbot.pokerDataModel[jiraId].voting
    let keys = Object.keys(votingMap)
    if (pokerbot.pokerDataModel[jiraId].channelId.members === keys.length) {
      console.log('All member have voted so closing the game now.')
      let responseText
      responseText = util.getVotingResult(jiraId, pokerbot.pokerDataModel)
      responseText = responseText + ' Thanks for voting.'
      responseEphemeral = {
        response_type: IN_CHANNEL,
        replace_original: true,
        text: 'Planning for ' + jiraId + ' is complete.'
      }
      util.postMessageToChannel(token, pokerbot.pokerDataModel[jiraId].channelId.id, responseText)
      delete pokerbot.pokerDataModel[jiraId]
    }
  } else {
    responseEphemeral = {
      response_type: EPHEMERAL,
      text: 'Voting for ' + jiraId + ' is closed.',
      replace_original: true
    }
  }
  console.log('Option vote : end')
  return res.status(200).json(responseEphemeral)
}

/**
 * We are asking the slack server to give us information of all users in channel
 */
pokerbot.getAllUsersInTeam = function () {
  console.log('Inside getAllUsersInTeam : begin')
  util.getAllUsersInTeam()
  .then((users) => {
    for (let index = 0; index < users.length; index++) {
      pokerbot.allUsersInTeam[users[index].id] = users[index].name
    }
    console.log('Got all users in team from  slack.')
    console.log(pokerbot.allUsersInTeam)
    console.log('Inside getAllUsersInTeam : end')
  })
  .catch((err) => {
    console.error(err)
    console.log('Inside getAllUsersInTeam : end')
  })
}

/**
 * We are asking the slack server to give us channel information
 * @param {Array} userIdArray - Array of all new users.
 * @param {Function} callback - callback to be executed..
 */
pokerbot.addNewUsersInTeam = function (userIdArray, callback) {
  console.log('Inside addNewUsersInTeam : begin')
  let promises = []
  let promise
  for (let index = 0; index < userIdArray.length; index++) {
    promise = util.getUserInTeam(userIdArray[index])
    promises.push(promise)
  }
  console.log('Number of promises to be resolved : ' + promise.length)
  Promise.all(promises).then(users => {
    _(users).forEach(function (user) {
      pokerbot.allUsersInTeam[user.id] = user.name
    })
    if (callback !== undefined) {
      callback()
    }
  })
  console.log('Inside addNewUsersInTeam : end')
}

module.exports = pokerbot
