/* eslint-disable eqeqeq */
/* eslint-disable no-plusplus */
import  {get}  from 'axios';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import  {config}  from 'dotenv';
import {MongoClient}  from 'mongodb';
config({ path: './.config.env' });

const port = 3000;
const token = process.env.TOKEN;
const app = express();

//CONNECTING TO MONGODB

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);
const client = new MongoClient(DB);

const DBconnect = async () => {
  try {
    await client.connect();
    console.log('Connected to DB');
  } catch (e) {
    console.log(e);
  }
};

let listOfCurrenciesFull = [];
let listOfCurrenciesNames = [];
DBconnect();

const currencyResponse = async (url) => {
  try {
    const response = await get(url, {
      headers: {
        'X-CMC_PRO_API_KEY': '995d8012-98b3-4679-944d-1f059c038d8e',
      },
      params: {
        start: '1',
        limit: '15',
        convert: 'USD',
      },
    });
    return response.data;
  } catch (err) {
    console.log(err.message);
  }
};

//CREATING TELEGRAM BOT

const bot = new TelegramBot(token, { polling: true });

//SETTING NOT COMMANDS

bot.setMyCommands([
  { command: '/start', description: 'saying hello' },
  { command: '/listrecent', description: 'top -15 currencies right now' },
  { command: '/addtofavourite', description: 'adding currency in your list' },
  { command: '/listfavourite', description: 'showing your list of currencies' },
  { command: '/deletefavouritelist', description: 'makes your list empty' },
  { command: '/help', description: 'info about the bot' },
]);

//RECEIVING RESPONSE FROM THE API

currencyResponse(
  'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest'
)
  .then((response) => {
    listOfCurrenciesFull = response.data.map((item) => {
      return {
        symbol: item.symbol,
        price: item.quote.USD.price,
        name: item.name,
        slug: item.slug,
        pairs: item.num_market_pairs,
        percent_change_24h: item.quote.USD.percent_change_24h,
        volume_change_24h: item.quote.USD.volume_change_24h,
      };
    });
    listOfCurrenciesNames = listOfCurrenciesFull.map((itm) => {
      return itm.symbol;
    });
  })
  .then(() => {
    const listOfCurrencies = (chatId) => {
      let reclist = listOfCurrenciesFull.map((elem) => {
        return '/' + elem.symbol + '  $' + elem.price;
      });
      bot.sendMessage(chatId, reclist.join('\n'));
    };

    // SETTING ANSWERS ON BOT COMMANDS
    bot.on('message', (msg) => {
      const { text } = msg;
      const chatId = msg.chat.id;
      const text_currency = text.split(' ')[1];
      const text_command = text.split(' ')[0];
      const collection = client.db().collection('currencies');
      // ?????????
      collection.find({ chatId }).forEach((doc) => {
        if (!doc.chatId) {
          collection.insertOne({ chatId: chatId, currencies: [] });
        }
      });
      try {
        if (text_command === '/help') {
          return bot.sendMessage(
            chatId,
            'Hello,there is your cryptocurrency bot! \n Commands that you can use: \n /listrecent - shows to you top-15 the most popular cryptocurrencies and their prices \n Clicking on the currency name will show you more detail information about it \n /addtofavourite {name} will add this currency to your favourite list \n /listfavourite will give you an information about currencies that you have added before \n /deletefavourite {name} will remove item from your selection\n /deletefavouritelist will delete the whole list'
          );
        }

        if (text_command === '/start') {
          collection.update(
            { chatId: chatId },
            { chatId: chatId, currencies: [] },
            { upsert: true }
          );
          return bot.sendMessage(chatId, 'Hello from cryptocurrency Bot!');
        }
        if (text_command === '/listrecent') {
          return listOfCurrencies(chatId);
        }
        if (text === '/addtofavourite') {
          return bot.sendMessage(chatId, 'Define the currency, please!');
        }
        if (
          text_command ===
          '/addtofavourite' /*&& listOfCurrenciesFull.find(item => item.symbol === text_currency)*/
        ) {
          collection.find({ chatId }).forEach((doc) => {
            if (doc.currencies.find((elem) => elem === text_currency)) {
              return bot.sendMessage(
                chatId,
                'This currency is already in your list!'
              );
            }
            if (listOfCurrenciesNames.find((item) => item === text_currency)) {
              collection.updateOne(
                { chatId },
                {
                  $addToSet: { currencies: text_currency },
                }
              );
              return bot.sendMessage(chatId, 'Added to your favourite list');
            }
            return bot.sendMessage(chatId, 'Invalid cryptocurrency name!');
          });
          return 0;
        }
        if (text === '/listfavourite') {
          let listFav = 'Favourite list is : \n';

          const cursor = collection.find({ chatId });
          cursor.each((err, doc) => {
            if (doc != null || doc != undefined) {
              const favouriteArray = doc.currencies.map((element) => {
                const currency = listOfCurrenciesFull.find(
                  (elem) => elem.symbol == element
                );
                return '/' + currency.symbol + ' $' + currency.price;
              });
              listFav = listFav + favouriteArray.join('\n');
              if (listFav == 'Favourite list is : \n') {
                listFav = 'Favourite list is empty!';
              }
              return bot.sendMessage(chatId, listFav);
            }
          });
          return 0;
        }

        if (listOfCurrenciesFull.find((item) => '/' + item.symbol === text)) {
          const elementData = listOfCurrenciesFull.find(
            (item) => '/' + item.symbol === text
          );
          return bot.sendMessage(
            chatId,
            `Short info about this cryptocurrency:
            Symbol: ${elementData.symbol}
            Price in USD: ${elementData.price}
            Name: ${elementData.name} 
            Slug: ${elementData.slug} 
            Num Market Pairs: ${elementData.pairs}
            Percent change 24h: ${elementData.percent_change_24h} 
            Volume change 24h: ${elementData.volume_change_24h}`
          );
        }

        if (text === '/deletefavouritelist') {
          collection.update(
            { chatId: chatId },
            { chatId: chatId, currencies: [] },
            { upsert: true }
          );
          return bot.sendMessage(chatId, 'Favourite list is empty!');
        }

        if (text_command === '/deletefavourite') {
          collection.find({ chatId }).forEach((doc) => {
            if (doc.currencies.find((el) => el === text_currency)) {
              collection.updateOne(
                { chatId },
                { $pull: { currencies: text_currency } }
              );
              return bot.sendMessage(
                chatId,
                'Deleted from your favourite list!'
              );
            }
            if (listOfCurrenciesNames.find((elem) => elem === text_currency)) {
              return bot.sendMessage(
                chatId,
                'You have not added this currency in your list!'
              );
            }
            return bot.sendMessage(chatId, 'Invalid currency name!');
          });
          return 0;
        }

        return bot.sendMessage(
          chatId,
          'Please , call /help command because i do not understand you =('
        );
      } catch (e) {
        return bot.sendMessage(chatId, 'Oops! Something occured!');
      }
    });
  })
  .catch((err) => {
    console.log('API call error:', err.message);
  });

//RUNNING THE SERVER

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
