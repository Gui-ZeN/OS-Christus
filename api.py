try:
    import requests
except ImportError:
    print("❌ Erro: O módulo 'requests' não está instalado.")
    print("Execute: pip install requests")
    exit(1)
import time

# Configurações do seu projeto
API_KEY = "d9ca0bd6dd0d81a48b3b3ecc4054faec"
CIDADE = "Sao Paulo"  # Digite o nome da sua cidade aqui
URL = f"https://openweathermap.org{CIDADE}&appid={API_KEY}&lang=pt_br"

# Variável de controle para registrar o estado anterior
esta_chovendo_antes = False

print(f"🚀 Monitor de chuva iniciado para a cidade: {CIDADE}")
print("Verificando condições climáticas a cada 5 minutos...")

while True:
    try:
        # Faz a consulta na API do OpenWeather
        resposta = requests.get(URL).json()
        
        # Se a API retornar erro (ex: chave inválida ou cidade errada)
        if resposta.get("cod") != 200:
            print(f"❌ Erro da API: {resposta.get('message')}")
            time.sleep(60)
            continue
            
        # Extrai a condição climática principal (ex: 'Rain', 'Clouds', 'Clear')
        clima_atual = resposta["weather"][0]["main"].lower()
        descricao = resposta["weather"][0]["description"]
        
        # Identifica se a condição atual indica chuva ou chuvisco
        esta_chovendo_agora = "rain" in clima_atual or "drizzle" in clima_atual
        
        if esta_chovendo_agora:
            # Se começou a chover exatamente agora e antes não estava chovendo
            if not esta_chovendo_antes:
                print(f"🚨 ALERTA: Começou a chover agora! Condição: {descricao}")
                # [OPCIONAL] Adicione aqui a sua função de envio de Telegram/WhatsApp/E-mail
                esta_chovendo_antes = True
            else:
                print(f"🌧️ Continua chovendo... ({descricao})")
        else:
            # Se parou de chover exatamente agora
            if esta_chovendo_antes:
                print(f"⛅ A chuva parou. Condição atual: {descricao}")
            else:
                print(f"☀️ Sem chuva no momento. Condição atual: {descricao}")
            esta_chovendo_antes = False
            
    except Exception as e:
        print(f"⚠️ Erro de conexão ou execução: {e}")
        
    # Aguarda 5 minutos (300 segundos) para não estourar o limite gratuito da API
    time.sleep(300)
