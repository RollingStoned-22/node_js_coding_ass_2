const bcrypt = require('bcrypt')
const express = require('express')
const jwt = require('jsonwebtoken')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')

const app = express()
app.use(express.json())

let db = null
const dbPath = path.join(__dirname, 'twitterClone.db')

const initialiseDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initialiseDBAndServer()

const authenticateToken = async (request, response, next) => {
  let jwtToken
  const auth = request.headers['authorization']
  if (auth !== undefined) {
    jwtToken = auth.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userId = payload.userId
        next()
      }
    })
  }
}

// POST register API 1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `
    select *
    from user
    where username = "${username}";
    `
  const user = await db.get(getUserQuery)
  if (user !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPwd = await bcrypt.hash(password, 10)
      const postUserQuery = `
      insert into 
      user(username,password,name,gender)
      values("${username}", "${hashedPwd}", "${name}", "${gender}");
      `
      await db.run(postUserQuery)
      response.send('User created successfully')
    }
  }
})

//POST login API 2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserIdQuery = `
    select *
    from user
    where username = "${username}";
    `
  const user = await db.get(getUserIdQuery)
  if (user === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPwdCorrect = await bcrypt.compare(password, user.password)
    if (isPwdCorrect === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const {user_id} = user
      const payload = {userId: user_id}
      const jwtToken = await jwt.sign(payload, 'SECRET')
      response.send({jwtToken})
    }
  }
})

// GET following user tweets API 3

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getTweetsQuery = `
  select user.username, tweet.tweet, tweet.date_time as dateTime
  from tweet 
  join follower on tweet.user_id = follower.following_user_id
  join user on user.user_id = tweet.user_id
  where follower.follower_user_id = ${userId}
  order by tweet.date_time desc
  limit 4;`

  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

// GET following API 4

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getFollowingNames = `
  select user.name
  from user
  join follower on user.user_id = follower.following_user_id
  where follower.follower_user_id = ${userId};
  `
  const followingNames = await db.all(getFollowingNames)
  response.send(followingNames)
})

// GET followers API 5

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getFollowerNames = `
  select user.name
  from user
  join follower on user.user_id = follower.follower_user_id
  where follower.following_user_id = ${userId};
  `
  const followerNames = await db.all(getFollowerNames)
  response.send(followerNames)
})

// GET Tweet details API 6

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request.params
  console.log(userId)
  const getTweetUserId = `
  select user_id
  from tweet
  where tweet_id = ${tweetId};
  `
  let tweetUserId = await db.get(getTweetUserId)
  tweetUserId = tweetUserId.user_id
  const getFollowingIds = `
  select user.user_id
  from user
  join follower on user.user_id = follower.following_user_id
  where follower.follower_user_id = ${userId};
  `
  const ids = await db.all(getFollowingIds)
  let k = 0
  for ({user_id} of ids) {
    if (user_id === tweetUserId) {
      k += 1
      continue
    }
  }
  if (k === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const getTweetDetails = `
    select
    tweet.tweet,
    (SELECT COUNT(like.like_id) 
     FROM like 
     WHERE like.tweet_id = tweet.tweet_id) AS likes,
    (SELECT COUNT(reply.reply_id) 
     FROM reply 
     WHERE reply.tweet_id = tweet.tweet_id) AS replies,
    tweet.date_time AS dateTime
    from tweet
    join reply on tweet.tweet_id = reply.tweet_id
    join like on tweet.tweet_id = like.tweet_id
    where tweet.tweet_id = ${tweetId};`
    const tweetDetails = await db.get(getTweetDetails)
    response.send(tweetDetails)
  }
})

// API 7

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const getTweetUserId = `
  select user_id
  from tweet
  where tweet_id = ${tweetId};
  `
    let tweetUserId = await db.get(getTweetUserId)
    tweetUserId = tweetUserId.user_id
    const getFollowingIds = `
  select user.user_id
  from user
  join follower on user.user_id = follower.following_user_id
  where follower.follower_user_id = ${userId};
  `
    const ids = await db.all(getFollowingIds)
    let k = 0
    for ({user_id} of ids) {
      if (user_id === tweetUserId) {
        k += 1
        continue
      }
    }
    if (k === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getTweetNames = `
    select user.name
    from user
    join like on like.user_id = user.user_id
    where like.tweet_id = ${tweetId}
    `
      const tweetNames = await db.all(getTweetNames)
      let names = []
      for (let {name} of tweetNames) {
        names.push(name)
      }
      response.send({likes: names})
    }
  },
)

// API 8

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const getTweetUserId = `
  select user_id
  from tweet
  where tweet_id = ${tweetId};
  `
    let tweetUserId = await db.get(getTweetUserId)
    tweetUserId = tweetUserId.user_id
    const getFollowingIds = `
  select user.user_id
  from user
  join follower on user.user_id = follower.following_user_id
  where follower.follower_user_id = ${userId};
  `
    const ids = await db.all(getFollowingIds)
    let k = 0
    for ({user_id} of ids) {
      if (user_id === tweetUserId) {
        k += 1
        continue
      }
    }
    if (k === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getTweetReplies = `
    select user.name, reply.reply
    from user
    join reply on reply.user_id = user.user_id
    where reply.tweet_id = ${tweetId}
    `
      const tweetReplies = await db.all(getTweetReplies)
      response.send(tweetReplies)
    }
  },
)

// API 9

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getTweets = `
  select 
  tweet.tweet,
  COUNT(like.like_id) as likes,
  COUNT(reply.reply_id) as replies,
  tweet.date_time as dateTime
  from tweet
  join like on tweet.user_id = like.user_id
  join reply on tweet.user_id = reply.user_id
  where tweet.user_id = ${userId};`
  const tweets = await db.all(getTweets)
  response.send(tweets)
})

// API 10

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const {tweet} = request.body
  console.log(tweet)
  const postTweet = `
  insert into 
  tweet(tweet)
  values("${tweet}");
  `
  await db.run(postTweet)
  response.send('Created a Tweet')
})

//API 11

app.delete('tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetUserId = `
  select user_id
  from tweet
  where tweet_id = ${tweetId};`
  const tweetUserId = await db.get(getTweetUserId)
  if (tweetUserId !== userId) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweet = `
    delete from 
    tweet
    where tweet_id = ${tweetId};
    `
    await db.run(deleteTweet)
    response.send('Tweet Removed')
  }
})

module.exports = app
