 # imagem pequena, já com Chromium
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# diretório de trabalho
WORKDIR /app

# otimiza cache
COPY package*.json ./
RUN npm ci --omit=dev

# copie o restante
COPY . .

# compile (se usa TS)
# ajuste se sua saída é dist/index.js ou dist/bot.js
RUN if [ -f tsconfig.json ]; then npm run build; fi

# boas práticas p/ prod
ENV NODE_ENV=production
# importante para puppeteer-core achar o chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# porta só se você expõe HTTP (não é necessário para o bot)
EXPOSE 3000

# comando — ajuste se seu entrypoint é diferente
CMD [ "npm", "start" ]
