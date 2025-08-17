import { Client, LocalAuth, Message, Chat, Contact, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

// Inicia o cliente com sessão persistente
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Ajuda a criar delays
const delay = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));

// Mapeia estado de cada chat (aguardando menu, etc.)
const chatState: Map<string, 'aguardando_opcao' | 'normal'> = new Map();

// Evento QR
client.on('qr', (qr: string) => {
  console.log('QR recebido, escaneie para autenticar:');
  qrcode.generate(qr, { small: true });
});

// Evento ready
client.on('ready', () => {
  console.log('Robô pronto para funcionar');
});

// Evento de mensagem recebida
client.on('message', async (msg: Message) => {
  // Somente em chats privados
  if (!msg.from.endsWith('@c.us')) return;

  const chatId = msg.from;
  const text = msg.body.trim();

  // Se estiver aguardando opção de menu, processa aqui
  if (chatState.get(chatId) === 'aguardando_opcao') {
    if (/^[0-5]$/.test(text)) {
      await handleMenuOption(msg, text);
      chatState.set(chatId, 'normal');
    } else {
      await msg.reply('Por favor digite um número de 0 a 5 ou /menu para ver o menu.');
    }
    return;
  }

  // Se usuário digitar /menu a qualquer momento
  if (text.toLowerCase().match(/^(menu)$/i)) {
    await sendMenu(msg);
    chatState.set(chatId, 'aguardando_opcao');
    return;
  }

  // Saudação inicial
  if (msg.body.toLowerCase().match(/^(oi|olá|ola|dia|tarde|noite|jonny|jhony|jony|jhonny)$/i)) {
    await sendWelcomeMenu(msg);
    chatState.set(chatId, 'aguardando_opcao');
    return;
  }

});

// Envia menu de boas-vindas
async function sendWelcomeMenu(msg: Message): Promise<void> {
  const chat: Chat = await msg.getChat();
  const contact: Contact = await msg.getContact();
  const nome = contact.pushname?.split(' ')[0] || 'amigo';

  await chat.sendStateTyping();
  await delay(800);
  await chat.sendMessage(
    `Olá ${nome}, bem-vindo ao CT Jhonny Alves! 🤖\n` +
    `Serei seu assistente virtual. Se quiser ver o menu novamente, digite /menu.\n\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
    `0 – Encerrar atendimento`
  );
}

// Envia menu sem saudação
async function sendMenu(msg: Message): Promise<void> {
  const chat: Chat = await msg.getChat();
  await chat.sendMessage(
    `Menu:\n` +
    `1 – Conhecer o CT\n` +
    `2 – Aula experimental\n` +
    `3 – Planos\n` +
    `4 – Horários\n` +
    `5 – Pagamentos\n` +
    `0 – Encerrar atendimento`
  );
}

// Processa escolha do menu
async function handleMenuOption(msg: Message, option: string): Promise<void> {
  const chat: Chat = await msg.getChat();
  let resposta = '';

  switch (option) {
    case '1':
      resposta =
        `*Modalidades do CT*:\n- Muay Thai, Boxe, Jiu Jitsu, Capoeira, Treino Funcional\n` +
        `*Unidades*:\n• Saraiva: Rua Tapajós, 767\n• Santa Mônica: Rua José Carrijo, 195\n` +
        `Atendemos todos os níveis: iniciantes a competidores profissionais.\n\n` +
        `Se quiser ver as opções novamente é só digitar "menu"😉`;
      break;
    case '2':
      const mediaPath = path.join(__dirname, '..', 'horarios.pdf');
      const media = MessageMedia.fromFilePath(mediaPath);
      resposta =
        `*Aula Experimental*:\nPerfeito! 😃\n` +
        `Quando ficaria melhor pra você?\n` +
        `Pra te ajudar, vou te mandar a planilha de horários, só um instante.\n\n` +
        `Se quiser voltar ao menu é só digitar "menu"😉 `;
      await chat.sendMessage(media);
      await chat.markUnread()
      break;
    case '3':
      resposta =
        `*Planos Disponíveis*:\n- Iniciante (R$99,00): 1 aula/semana\n` +
        `- Lutador (R$150,00): até 3 aulas/semana + descontos\n` +
        `- Campeão (R$260,00): ilimitado + 1 personal/mês + descontos familiares\n` +
        `- Universitário (R$79,90): 4 aulas/semana + descontos (exclusivo UFU)\n\n` +
        `Me conta qual plano te agrada mais\n\n` +
        `Se quiser ver as opções novamente é só digitar "menu"😉`;
      break;
    case '4': {
      const mediaPath = path.join(__dirname, '..', 'horarios.pdf');
      if (fs.existsSync(mediaPath)) {
        const media = MessageMedia.fromFilePath(mediaPath);
        await chat.sendMessage('*Segue a planilha de horários em PDF:*');
        await chat.sendMessage(media);
      } else {
        await chat.sendMessage('⚠️ Arquivo de horários não encontrado no servidor.');
      }
      break;
    }

    case '5':
      resposta =
        `*Pagamentos*:\n` +
        `Todos os pagamentos devem ser feitos para:\n` +
        `CNPJ: 58.656.721/0001-34\n` +
        `Titular: João Pedro Alves Santana (Banco Sicred)\n\n` +
        `Se quiser ver as opções novamente é só digitar "menu"😉`;
      await chat.markUnread()
      break;
    case '0':
      resposta = `Encerrando atendimento. Se precisar de algo mais, digite /menu.`;
      break;
  }

  await chat.sendMessage(resposta);
}

// Inicializa o cliente
client.initialize();


