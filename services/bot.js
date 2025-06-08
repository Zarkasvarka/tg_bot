const TelegramBot = require('node-telegram-bot-api');
const { findUserByTelegramId, registerUser, getBalance } = require('../controllers/users');
const { getDisciplines } = require('../controllers/matches');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- Константы и переменные ---

const mainKeyboard = {
  reply_markup: {
    keyboard: [[{ text: 'Старт'}, { text: 'Баланс' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
    input_field_placeholder: 'Гатофтэ дэньгы'
  },
};

const inlineMessagesMap = new Map(); // Хранит message_id с инлайн-кнопками для каждого чата

const userCooldowns = new Map();     // Хранит время последнего вызова команды для каждого пользователя
const COOLDOWN_MS = 500;             // Минимальный интервал между вызовами (в мс)

// --- Функции ---


async function checkCooldownAndWarn(telegramId, chatId) {
  const now = Date.now();
  const lastTime = userCooldowns.get(telegramId) || 0;

  if (now - lastTime < COOLDOWN_MS) {
    await bot.sendMessage(chatId, 'Пожалуйста, не спамьте команду, подождите немного.');
    return false;
  }

  userCooldowns.set(telegramId, now);
  return true;
}

async function clearPreviousInlineKeyboards(chatId) {
  const messageIds = inlineMessagesMap.get(chatId) || [];

  for (const messageId of messageIds) {
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (e) {
    }
  }

  inlineMessagesMap.set(chatId, []);
}

async function sendWelcomeAndDisciplines(chatId, telegramId, username) {
  try {
    // Регистрация пользователя, если он новый
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      const tokens = await registerUser(telegramId, username);
      await bot.sendMessage(chatId, `Добро пожаловать! Вы зарегистрированы и получили ${tokens} токенов на баланс.`, mainKeyboard);
    } else {
      await bot.sendMessage(chatId, 'Вы уже зарегистрированы. Добро пожаловать обратно!', mainKeyboard);
    }

    // Очистка предыдущих инлайн-кнопок
    await clearPreviousInlineKeyboards(chatId);

    // Получение дисциплины из базы
    const disciplines = await getDisciplines();

    if (disciplines.length === 0) {
      await bot.sendMessage(chatId, 'Пока нет доступных дисциплин.');
      return;
    }
    
    // Формирование инлайн-кнопки с названиями дисциплин
    const inlineKeyboard = disciplines.map(discipline => {
      return [{
        text: discipline.name,
        web_app: { url: `https://webappkemgu.netlify.app/discipline/${discipline.disciplineid}` }
      }];
    });

    // Отправка сообщения с инлайн-кнопками и сохранение message_id
    const sentMessage = await bot.sendMessage(chatId, 'Выберите дисциплину:', {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });

    // message_id для последующей очистки
    const messageIds = inlineMessagesMap.get(chatId) || [];
    messageIds.push(sentMessage.message_id);
    inlineMessagesMap.set(chatId, messageIds);

  } catch (error) {
    console.error('Ошибка при отправке приветствия и дисциплин:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке данных.');
  }
}

async function sendBalance(chatId, telegramId) {
  try {
    const balance = await getBalance(telegramId);
    await bot.sendMessage(chatId, `Ваш текущий баланс: ${balance} токенов.`, mainKeyboard);
  } catch (error) {
    console.error('Ошибка при отправке баланса:', error);
    await bot.sendMessage(chatId, 'Не удалось получить баланс.');
  }
}

async function sendHelp(chatId) {
  const helpMessage = `
Бот принимает следующие команды:

/start - Запуск бота

/balance - Ваш баланс токенов

/help - Просмотреть возможные команды и/или информацию о боте
  `;
  await bot.sendMessage(chatId, helpMessage, mainKeyboard);
}

// --- Обработчики событий ---
bot.onText(/\/start/, async (msg) => {
  const { id: chatId } = msg.chat;
  const { id: telegramId, username = '' } = msg.from;

  if (!(await checkCooldownAndWarn(telegramId, chatId))) return;

  await sendWelcomeAndDisciplines(chatId, telegramId, username);
});

bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!(await checkCooldownAndWarn(telegramId, chatId))) return;

  await sendBalance(chatId, telegramId);
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!(await checkCooldownAndWarn(telegramId, chatId))) return;

  await sendHelp(chatId);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const telegramId = msg.from.id;
  const username = msg.from.username || '';

  if (text === 'Старт') {
    if (!(await checkCooldownAndWarn(telegramId, chatId))) return;
    await sendWelcomeAndDisciplines(chatId, telegramId, username);
    return;
  }

  if (text === 'Баланс') {
    if (!(await checkCooldownAndWarn(telegramId, chatId))) return;
    await sendBalance(chatId, telegramId);
    return;
  }

  if (text.startsWith('/')) return;

  await bot.sendMessage(chatId,
    'Пожалуйста, используйте только команды: /start, /balance, /help или кнопки "Старт" и "Баланс".',
    mainKeyboard
  );
});

bot.setMyCommands([
    {command: '/start', description: 'запуск бота'},
    {command: '/balance', description: 'ваш баланс токенов'},
    {command: '/help', description: 'помощь'}
])

module.exports = bot;