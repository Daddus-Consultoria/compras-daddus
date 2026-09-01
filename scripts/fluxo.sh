#!/bin/bash
# Ciclo completo de uma contratacao, do banco vazio ao saldo do contrato.
# Cada etapa confere o codigo HTTP esperado; no fim, o resumo do que falhou.
BASE=http://localhost:3000
J=${TMPDIR:-/tmp}/fluxo-daddus-jars
mkdir -p $J
FALHAS=()
PASSOS=0

req() { # req <jar> <metodo> <rota> [corpo]
  local jar=$1 metodo=$2 rota=$3 corpo=$4
  CODIGO=$(curl -s -o /tmp/fluxo.json -w "%{http_code}" -b "$J/$jar.jar" -c "$J/$jar.jar" \
    -X "$metodo" -H 'Content-Type: application/json' ${corpo:+-d "$corpo"} "$BASE$rota")
  CORPO=$(head -c 400 /tmp/fluxo.json)
}

etapa() { # etapa <esperado> <descricao>
  PASSOS=$((PASSOS+1))
  if [ "$CODIGO" = "$1" ]; then
    printf "  \033[32mok\033[0m   %-58s %s\n" "$2" "$CODIGO"
  else
    printf "  \033[31mFALHA\033[0m %-58s %s (esperado %s)\n     %s\n" "$2" "$CODIGO" "$1" "$CORPO"
    FALHAS+=("$2 -> $CODIGO (esperado $1): $CORPO")
  fi
}

entrar() { # entrar <jar> <email> [senha]
  local jar=$1 email=$2 senha=${3:-Daddus@2026}
  rm -f $J/$jar.jar
  req $jar POST /api/auth/login "{\"email\":\"$email\",\"senha\":\"$senha\"}"
  etapa 200 "login: $email"
  req $jar PUT /api/auth/senha "{\"senhaAtual\":\"$senha\",\"novaSenha\":\"Portal@2026\"}"
  etapa 200 "troca da senha inicial: $email"
}

json() { python3 -c "import sys,json; d=json.load(open('/tmp/fluxo.json')); print($1)" 2>/dev/null; }

# O roteiro comeca sempre do banco vazio: e o unico jeito de o "do zero" ser
# verdade. Use PULAR_RESET=1 para rodar sobre o banco atual.
if [ "$PULAR_RESET" != "1" ]; then
  echo "== 0. Banco do zero, so com o superadmin =="
  (cd /workspaces/compras-daddus && npm run db:resetar >/dev/null 2>&1 \
    && SEMEAR_DEMO=false SENHA_SEED=Daddus@2026 npm run db:semear >/dev/null 2>&1) \
    && echo "  ok   7 migracoes aplicadas e superadmin criado" || echo "  FALHA ao preparar o banco"
  sleep 1
fi

echo
echo "== 1. Prefeitura nova, criada pelo superadmin =="
entrar superadmin superadmin@daddus.com.br
req superadmin POST /api/prefeituras '{"nome":"Prefeitura de Vila Nova","estado":"SP","cnpj":"11.222.333/0001-44","enderecoCompras":"Praca da Matriz, 10 - Centro - Vila Nova/SP"}'
etapa 201 "cria a prefeitura"
PREF=$(json "d['id']")
echo "     prefeitura_id=$PREF"
req superadmin GET "/api/secretarias?prefeitura=$PREF"
etapa 200 "superadmin lista as secretarias da prefeitura nova"
SEC_EDU=$(json "[s['id'] for s in d if s['chave']=='educacao'][0]")
SEC_SAU=$(json "[s['id'] for s in d if s['chave']=='saude'][0]")

echo
echo "== 2. Usuarios de cada perfil =="
# O quinto campo e a ordenacao de despesa. Helena requisita pela Educacao e nao
# autoriza; Vera e a ordenadora da mesma pasta. Sao duas pessoas de proposito:
# e essa separacao que o fluxo exige.
for linha in "Ana Lima|admin@vilanova.sp.gov.br|admin|null|false" \
             "Marina Alves|compras@vilanova.sp.gov.br|compras|null|false" \
             "Rui Barbosa|cpl@vilanova.sp.gov.br|cpl|null|false" \
             "Helena Braga|educacao@vilanova.sp.gov.br|secretario|$SEC_EDU|false" \
             "Vera Cruz|sec-educacao@vilanova.sp.gov.br|secretario|$SEC_EDU|true" \
             "Paulo Nery|saude@vilanova.sp.gov.br|secretario|$SEC_SAU|false" \
             "Bento Aguiar|gabinete@vilanova.sp.gov.br|gabinete|null|true" \
             "Clara Souza|gestor@vilanova.sp.gov.br|gestor|null|false"; do
  IFS='|' read -r nome email papel sec ord <<< "$linha"
  req superadmin POST /api/usuarios "{\"nome\":\"$nome\",\"email\":\"$email\",\"senha\":\"Daddus@2026\",\"papel\":\"$papel\",\"prefeituraId\":$PREF,\"secretariaId\":$sec,\"ordenador\":$ord}"
  etapa 201 "cria usuario $papel"
done
req superadmin POST /api/usuarios "{\"nome\":\"Nao Ordena\",\"email\":\"naoordena@vilanova.sp.gov.br\",\"senha\":\"Daddus@2026\",\"papel\":\"compras\",\"prefeituraId\":$PREF,\"secretariaId\":null,\"ordenador\":true}"
etapa 400 "Setor de Compras nao pode ser ordenador de despesa"

entrar admin admin@vilanova.sp.gov.br
entrar compras compras@vilanova.sp.gov.br
entrar cpl cpl@vilanova.sp.gov.br
entrar ordenadora sec-educacao@vilanova.sp.gov.br
entrar gabinete gabinete@vilanova.sp.gov.br
entrar educacao educacao@vilanova.sp.gov.br
entrar saude saude@vilanova.sp.gov.br
entrar gestor gestor@vilanova.sp.gov.br

echo
echo "== 3. Demanda da secretaria (DFD) =="
req educacao POST /api/dfd '{"objeto":"Material de expediente para as escolas da rede municipal","justificativa":"O estoque do almoxarifado central atende ate o fim do primeiro semestre; sem reposicao as escolas ficam sem material no retorno as aulas.","prioridade":"alta","dataPretendida":"30/10/2026","previsaoPca":true,"resultados":"Doze escolas abastecidas por doze meses, sem compra emergencial.","responsavel":"Helena Braga, diretora administrativa","itens":[{"item":1,"descricao":"Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas","unidade":"PCT","quantidade":120,"memoria":"Media de 10 pacotes por escola por mes, nas 12 escolas."},{"item":2,"descricao":"Caneta esferografica azul, corpo cristal, ponta media","unidade":"CX","quantidade":40,"memoria":"Uma caixa por sala de aula por bimestre."}]}'
etapa 201 "educacao formaliza o DFD"
DFD=$(json "d['numero']")
echo "     DFD=$DFD"

req compras GET /api/dfd
etapa 200 "compras enxerga a demanda na fila"

echo
echo "== 4. Processo gerado a partir da demanda =="
req compras GET "/api/processos?sugerirNumero=1"
etapa 200 "sugestao de numero do processo"
PROC=$(json "d['numero']")
req compras GET /api/dfd
DFD_ID=$(json "[x['id'] for x in d if x['numero']=='$DFD'][0]")
req compras POST /api/processos "{\"numero\":\"$PROC\",\"objeto\":\"Material de expediente para as escolas da rede municipal\",\"prazoLimite\":\"15/10/2026\",\"secretaria\":\"educacao\",\"solicitacaoId\":$DFD_ID}"
etapa 201 "abre o processo $PROC a partir do DFD"

req compras GET /api/processos
ITENS=$(python3 -c "
import json
d=json.load(open('/tmp/fluxo.json'))
p=[x for x in d if x['id']=='$PROC'][0]
print(len(p['itens']), sum(int(i['quantidades'].get('educacao',0)) for i in p['itens']))")
if [ "$ITENS" = "2 160" ]; then
  printf "  \033[32mok\033[0m   %-58s %s\n" "lote nasce com os itens e a quantidade do DFD" "$ITENS"
else
  printf "  \033[31mFALHA\033[0m %-58s %s (esperado '2 160')\n" "lote nasce com os itens e a quantidade do DFD" "$ITENS"
  FALHAS+=("lote do DFD -> $ITENS")
fi
PASSOS=$((PASSOS+1))

echo
echo "== 5. Coleta de quantidades =="
req compras PATCH "/api/processos/$PROC/status" '{"status":"coleta_quantidades","observacao":"Abertura da coleta junto as secretarias."}'
etapa 200 "compras abre a coleta"
req saude GET /api/processos
python3 - <<PY > /tmp/lote.json
import json
d=json.load(open('/tmp/fluxo.json'))
p=[x for x in d if x['id']=='$PROC'][0]
for item in p['itens']:
    item['quantidades']['saude'] = 45 if item['item'] == 1 else 18
print(json.dumps({"notas": p['notas'], "itens": p['itens']}))
PY
CODIGO=$(curl -s -o /tmp/fluxo.json -w "%{http_code}" -b $J/saude.jar -X PUT -H 'Content-Type: application/json' -d @/tmp/lote.json "$BASE/api/processos/$PROC/lote"); CORPO=$(head -c 300 /tmp/fluxo.json)
etapa 200 "saude lanca a propria quantidade"

# Quem ja fechou e quem falta. Antes da migracao 008 a pergunta so tinha
# resposta por inferencia (algum numero > 0), que confunde "nao preciso de
# nada" com "nao entrou no sistema".
req saude POST "/api/processos/$PROC/lancamento" '{}'
etapa 200 "saude conclui o proprio lancamento"
req compras PATCH "/api/processos/$PROC/status" '{"status":"em_cotacao","observacao":""}'
etapa 422 "compras nao avanca com secretaria pendente e sem motivo"

# Catalogo e precos publicos. O catalogo pode estar vazio (a coleta e separada,
# `npm run catalogo`, e o db:resetar la em cima apaga tudo), entao aqui se
# confere o contrato da rota — nao o conteudo.
req compras GET "/api/catalogo?q=papel"
etapa 200 "busca no catalogo CATMAT/CATSER responde"
req compras GET "/api/processos/$PROC/precos?item=1"
etapa 409 "preco publico exige item vinculado ao catalogo"

echo
echo "== 6. Pesquisa de precos =="
req compras PATCH "/api/processos/$PROC/status" '{"status":"em_cotacao","observacao":"Quantidades consolidadas."}'
etapa 200 "compras abre a cotacao"
for c in '{"item":1,"fonte":"painel_precos","descricao":"Painel de Precos federal","documento":"Item 15125","valorUnitario":28.9,"dataCotacao":"04/08/2026"}' \
         '{"item":1,"fonte":"pncp","descricao":"Prefeitura de Franca","documento":"PNCP 12345","valorUnitario":29.5,"dataCotacao":"07/08/2026"}' \
         '{"item":1,"fonte":"fornecedor","descricao":"Norte Suprimentos LTDA","documento":"CNPJ 11.222.333/0001-44","valorUnitario":31.2,"dataCotacao":"12/08/2026"}' \
         '{"item":2,"fonte":"painel_precos","descricao":"Painel de Precos federal","documento":"Item 22871","valorUnitario":42.5,"dataCotacao":"04/08/2026"}' \
         '{"item":2,"fonte":"sitio_eletronico","descricao":"Distribuidora Papelar","documento":"www.papelar.com.br","valorUnitario":44,"dataCotacao":"09/08/2026"}' \
         '{"item":2,"fonte":"fornecedor","descricao":"Escritorio Total ME","documento":"CNPJ 44.555.666/0001-77","valorUnitario":45.9,"dataCotacao":"11/08/2026"}'; do
  req compras POST "/api/processos/$PROC/cotacoes" "$c"
  etapa 201 "lanca cotacao"
done
req compras PATCH "/api/processos/$PROC/status" '{"metodo":"mediana","justificativaMetodo":"Cesta com dispersao proxima do limite: a mediana reduz o peso do extremo superior."}'
etapa 200 "define o metodo de formacao de preco"

echo
echo "== 7. Estudo tecnico preliminar =="
req compras GET "/api/etp/$PROC"
etapa 200 "ETP nasce com os incisos apurados"
python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print('     demanda:', d['derivado']['demanda'], '| valor:', round(d['derivado']['valorTotal'],2), '| itens com memoria:', sum(1 for i in d['derivado']['itens'] if i['memoria']))"
req compras POST "/api/etp/$PROC" '{"acao":"concluir"}'
etapa 422 "conclusao barrada sem os incisos obrigatorios"
req compras PATCH "/api/etp/$PROC" '{"parcelamento":"Objeto divisivel: a adjudicacao sera por item, ampliando a disputa (art. 40, V, b).","posicionamento":"A contratacao e viavel tecnica e economicamente e deve prosseguir.","requisitos":"Entrega em ate 15 dias, material com selo de sustentabilidade.","omissoes":"Os incisos II, VII, IX, X, XI e XII nao se aplicam: aquisicao de material de consumo, sem instalacao, treinamento ou residuo perigoso."}'
etapa 200 "grava os incisos discursivos"
req compras POST "/api/etp/$PROC" '{"acao":"concluir"}'
etapa 200 "conclui o estudo"
req cpl GET "/api/etp/$PROC"
etapa 200 "CPL le o estudo concluido"

echo
echo "== 8. Mapa e envio a comissao =="
req compras PATCH "/api/processos/$PROC/status" '{"status":"cotacao_concluida","observacao":"Precos levantados."}'
etapa 200 "cotacao concluida"
req compras PATCH "/api/processos/$PROC/status" '{"status":"mapa_elaborado","observacao":"Mapa de precos emitido."}'
etapa 200 "mapa elaborado"
req compras PATCH "/api/processos/$PROC/status" '{"status":"enviado_licitacao","observacao":"Mapa encaminhado a CPL."}'
etapa 200 "mapa enviado a CPL"

echo
echo "== 9. Tramitacao na CPL =="
req compras POST "/api/processos/$PROC/cpl" '{"tipo":"recebimento"}'
etapa 403 "compras nao registra tramite da comissao"
req cpl POST "/api/processos/$PROC/cpl" '{"tipo":"recebimento","documento":"Oficio 45/2026","data":"20/08/2026"}'
etapa 201 "CPL recebe o processo"
req cpl POST "/api/processos/$PROC/cpl" '{"tipo":"diligencia","observacao":"Solicitada juntada do ETP assinado ao processo fisico."}'
etapa 201 "CPL registra diligencia"
req cpl POST "/api/processos/$PROC/cpl" '{"tipo":"retorno","documento":"Contrato 001/2026","observacao":"Licitacao homologada; contrato assinado e devolvido ao Setor de Compras."}'
etapa 201 "CPL devolve com o contrato"

echo
echo "== 10. Contrato =="
req compras GET "/api/contratos?sugerirNumero=1"
etapa 200 "sugestao de numero do contrato"
CONTRATO=$(json "d['numero']")
req compras POST /api/contratos "{\"numero\":\"$CONTRATO\",\"fornecedor\":\"Norte Suprimentos LTDA\",\"cnpjFornecedor\":\"11.222.333/0001-44\",\"objeto\":\"Material de expediente para as escolas\",\"vigenciaInicio\":\"01/09/2026\",\"vigenciaFim\":\"31/12/2026\",\"documento\":\"Contrato $CONTRATO - DOM 02/09/2026\",\"status\":\"ativo\",\"processo\":\"$PROC\",\"copiarItens\":true}"
etapa 201 "cadastra o contrato devolvido, com os itens do lote"
req compras GET /api/processos
FASE=$(python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print([x for x in d if x['id']=='$PROC'][0]['status'])")
if [ "$FASE" = "contrato_ativo" ]; then printf "  \033[32mok\033[0m   %-58s %s\n" "o cadastro levou o processo a contrato ativo" "$FASE"; else printf "  \033[31mFALHA\033[0m %-58s %s\n" "o cadastro levou o processo a contrato ativo" "$FASE"; FALHAS+=("fase apos contrato -> $FASE"); fi
PASSOS=$((PASSOS+1))

echo
echo "== 11. Execucao: pedido de fornecimento =="
req educacao GET "/api/contratos/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$CONTRATO',safe=''))")/saldo"
etapa 200 "saldo do contrato disponivel"
IT1=$(json "d[0]['itemContratoId']")
req educacao POST /api/pedidos "{\"contrato\":\"$CONTRATO\",\"justificativa\":\"Primeira remessa do ano letivo para as escolas.\",\"entregaPrevista\":\"20/09/2026\",\"itens\":[{\"itemContratoId\":$IT1,\"quantidade\":60}]}"
etapa 201 "educacao pede fornecimento"
PEDIDO=$(json "d['id']")
req compras PATCH "/api/pedidos/$PEDIDO" '{"acao":"autorizar","empenho":"2026NE000431"}'
etapa 403 "o Setor de Compras nao autoriza a despesa"
req ordenadora PATCH "/api/pedidos/$PEDIDO" '{"acao":"autorizar"}'
etapa 409 "pedido sem conferencia nao chega ao ordenador"
req compras PATCH "/api/pedidos/$PEDIDO" '{"acao":"conferir"}'
etapa 200 "compras confere saldo, vigencia e itens"
req educacao PATCH "/api/pedidos/$PEDIDO" '{"acao":"autorizar"}'
etapa 403 "secretario que nao e ordenador nao autoriza"

req admin PUT /api/config-prefeitura "{\"nome\":\"Prefeitura de Vila Nova\",\"estado\":\"SP\",\"cnpj\":\"11.222.333/0001-44\",\"enderecoCompras\":\"Praca da Matriz, 10 - Centro - Vila Nova/SP\",\"exigeOrdenadorDistinto\":true,\"limiteAutorizacao\":10}"
etapa 200 "admin fixa a alcada do secretario em R$ 10"
req ordenadora PATCH "/api/pedidos/$PEDIDO" '{"acao":"autorizar"}'
etapa 403 "acima da alcada, o secretario nao autoriza"
req gabinete PATCH "/api/pedidos/$PEDIDO" '{"acao":"autorizar","empenho":"2026NE000431"}'
etapa 200 "gabinete autoriza acima da alcada e baixa o saldo"

echo
echo "== 11b. Alcada, e quem abriu nao autoriza =="
req admin PUT /api/config-prefeitura "{\"nome\":\"Prefeitura de Vila Nova\",\"estado\":\"SP\",\"cnpj\":\"11.222.333/0001-44\",\"enderecoCompras\":\"Praca da Matriz, 10 - Centro - Vila Nova/SP\",\"exigeOrdenadorDistinto\":true,\"limiteAutorizacao\":null}"
etapa 200 "admin tira o teto: o secretario volta a autorizar a propria pasta"
req educacao POST /api/pedidos "{\"contrato\":\"$CONTRATO\",\"justificativa\":\"Reposicao de papel para a secretaria escolar.\",\"itens\":[{\"itemContratoId\":$IT1,\"quantidade\":5}]}"
etapa 201 "educacao abre o segundo pedido"
PEDIDO2=$(json "d['id']")
req compras PATCH "/api/pedidos/$PEDIDO2" '{"acao":"conferir"}'
etapa 200 "compras confere o segundo pedido"
req ordenadora PATCH "/api/pedidos/$PEDIDO2" '{"acao":"autorizar"}'
etapa 200 "a ordenadora da pasta autoriza dentro da alcada"

req ordenadora POST /api/pedidos "{\"contrato\":\"$CONTRATO\",\"justificativa\":\"Pedido aberto pela propria ordenadora da pasta.\",\"itens\":[{\"itemContratoId\":$IT1,\"quantidade\":5}]}"
etapa 201 "a ordenadora tambem pode abrir pedido"
PEDIDO3=$(json "d['id']")
req compras PATCH "/api/pedidos/$PEDIDO3" '{"acao":"conferir"}'
etapa 200 "compras confere o pedido da ordenadora"
req ordenadora PATCH "/api/pedidos/$PEDIDO3" '{"acao":"autorizar"}'
etapa 403 "quem abriu o pedido nao o autoriza"
req gabinete PATCH "/api/pedidos/$PEDIDO3" '{"acao":"autorizar"}'
etapa 200 "o gabinete resolve o pedido da propria ordenadora"

req educacao POST /api/pedidos "{\"contrato\":\"$CONTRATO\",\"justificativa\":\"Pedido que sera devolvido pelo Setor de Compras.\",\"itens\":[{\"itemContratoId\":$IT1,\"quantidade\":5}]}"
etapa 201 "educacao abre um pedido para ser devolvido"
PEDIDO4=$(json "d['id']")
req compras PATCH "/api/pedidos/$PEDIDO4" '{"acao":"devolver"}'
etapa 400 "devolver sem motivo escrito e recusado"
req compras PATCH "/api/pedidos/$PEDIDO4" '{"acao":"devolver","motivo":"Quantidade acima do consumo mensal declarado no DFD."}'
etapa 200 "compras devolve com motivo, e o pedido sai de circulacao"
req educacao GET "/api/contratos/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$CONTRATO',safe=''))")/saldo"
SALDO=$(json "[ (i['contratada'], i['autorizada'], i['saldo']) for i in d ][0]")
echo "     item 1 (contratada, autorizada, saldo): $SALDO"

echo
echo "== 12. Encerramento =="
req compras PATCH "/api/processos/$PROC/status" '{"status":"encerrado","observacao":"Contrato executado."}'
etapa 409 "encerrar o processo com contrato ativo e recusado"
req compras PATCH "/api/contratos/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$CONTRATO',safe=''))")" '{"status":"encerrado"}'
etapa 200 "compras encerra o contrato"
req educacao POST /api/pedidos "{\"contrato\":\"$CONTRATO\",\"justificativa\":\"Pedido depois do encerramento do contrato.\",\"itens\":[{\"itemContratoId\":$IT1,\"quantidade\":10}]}"
etapa 409 "contrato encerrado nao aceita mais pedido"
req compras PATCH "/api/processos/$PROC/status" '{"status":"encerrado","observacao":"Contrato executado e encerrado."}'
etapa 200 "processo encerrado"

echo
echo "== 12b. Perfis que so acompanham =="
req gestor POST /api/dfd '{"objeto":"Tentativa do gestor","justificativa":"Justificativa suficientemente longa para passar na validacao.","prioridade":"media","itens":[]}'
etapa 403 "gestor nao formaliza demanda"
req saude PATCH "/api/processos/$PROC/status" '{"status":"em_montagem"}'
etapa 403 "secretaria nao move a fase do processo"
req gestor GET /api/contratos
etapa 200 "gestor acompanha os contratos"
req gabinete GET /api/pedidos
etapa 200 "gabinete enxerga os pedidos de todas as secretarias"
req gabinete PATCH "/api/pedidos/$PEDIDO" '{"acao":"conferir"}'
etapa 403 "gabinete nao faz a conferencia do Setor de Compras"

echo
echo "== 12c. Proximo ciclo =="
req educacao GET /api/dfd/importar
etapa 200 "fontes de importacao para a proxima demanda"
python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print('     fontes:', [(f['tipo'], f['id']) for f in d])"
req educacao GET "/api/dfd/importar?tipo=contrato&id=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$CONTRATO',safe=''))")"
etapa 200 "itens vindos do consumo do contrato"
python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print('     ', d[0]['quantidade'], d[0]['unidade'], '|', d[0]['memoria']) if d else print('      (vazio)')"

echo
echo "== 13. Segundo ciclo: demanda importando o consumo =="
req educacao GET "/api/dfd/importar?tipo=contrato&id=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$CONTRATO',safe=''))")"
ITENS_IMPORTADOS=$(python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print(json.dumps([{'item': i+1, 'descricao': x['descricao'], 'unidade': x['unidade'], 'quantidade': x['quantidade'], 'memoria': x['memoria']} for i,x in enumerate(d)]))")
req educacao POST /api/dfd "{\"objeto\":\"Material de expediente 2027\",\"justificativa\":\"Reposicao anual do almoxarifado, com base no consumo do contrato anterior.\",\"prioridade\":\"media\",\"dataPretendida\":\"30/01/2027\",\"previsaoPca\":true,\"resultados\":\"Escolas abastecidas sem compra emergencial.\",\"responsavel\":\"Helena Braga\",\"origemItens\":\"Importado do consumo do contrato $CONTRATO.\",\"itens\":$ITENS_IMPORTADOS}"
etapa 201 "nova demanda nasce do consumo do contrato"
DFD2=$(json "d['numero']")
req compras GET /api/dfd
DFD2_ID=$(json "[x['id'] for x in d if x['numero']=='$DFD2'][0]")
req compras GET "/api/processos?sugerirNumero=1"
PROC2=$(json "d['numero']")
req compras POST /api/processos "{\"numero\":\"$PROC2\",\"objeto\":\"Material de expediente 2027\",\"prazoLimite\":\"20/01/2027\",\"secretaria\":\"educacao\",\"solicitacaoId\":$DFD2_ID}"
etapa 201 "segundo processo aberto ($PROC2)"
req compras GET /api/processos
MEM=$(python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
p=[x for x in d if x['id']=='$PROC2'][0]
print(len(p['itens']), sum(int(i['quantidades'].get('educacao',0)) for i in p['itens']))")
# 70 = os tres pedidos autorizados no contrato (60 + 5 + 5). O devolvido nao
# entra: consumo e o que foi autorizado, e nao o que foi pedido.
if [ "$MEM" = "1 70" ]; then printf "  \033[32mok\033[0m   %-58s %s\n" "o lote do segundo ciclo veio do consumo real" "$MEM"; else printf "  \033[31mFALHA\033[0m %-58s %s (esperado '1 70')\n" "o lote do segundo ciclo veio do consumo real" "$MEM"; FALHAS+=("lote do segundo ciclo -> $MEM"); fi
PASSOS=$((PASSOS+1))

echo
echo "== 14. Caminho alternativo: licitacao fracassada =="
for fase in coleta_quantidades em_cotacao cotacao_concluida mapa_elaborado enviado_licitacao; do
  req compras PATCH "/api/processos/$PROC2/status" "{\"status\":\"$fase\",\"observacao\":\"Andamento do processo.\"}"
  etapa 200 "processo 2 vai para $fase"
done
req cpl POST "/api/processos/$PROC2/cpl" '{"tipo":"recebimento","documento":"Oficio 02/2027"}'
etapa 201 "CPL recebe o segundo processo"
req cpl POST "/api/processos/$PROC2/cpl" '{"tipo":"retorno","documento":"Ata 03/2027","observacao":"Licitacao fracassada: nenhuma proposta valida. Processo devolvido sem contratacao."}'
etapa 201 "CPL devolve sem contratacao"
req compras GET /api/processos
FASE2=$(python3 -c "
import json; d=json.load(open('/tmp/fluxo.json'))
print([x for x in d if x['id']=='$PROC2'][0]['status'])")
echo "     fase apos a devolucao: $FASE2"
req compras PATCH "/api/processos/$PROC2/status" '{"status":"cancelado","observacao":"Licitacao fracassada; a demanda sera reaberta com nova pesquisa de precos."}'
etapa 200 "compras cancela o processo sem contrato"
req educacao GET "/api/dfd/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$DFD2',safe=''))")"
SIT=$(json "(d['status'], d['processo'])")
if [ "$SIT" = "('pendente', None)" ]; then printf "  \033[32mok\033[0m   %-58s %s\n" "a demanda volta para a fila, sem vinculo" "$SIT"; else printf "  \033[31mFALHA\033[0m %-58s %s\n" "a demanda volta para a fila, sem vinculo" "$SIT"; FALHAS+=("demanda apos cancelamento -> $SIT"); fi
PASSOS=$((PASSOS+1))
req educacao PATCH "/api/dfd/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$DFD2',safe=''))")" "{\"objeto\":\"Material de expediente 2027 (segunda tentativa)\",\"justificativa\":\"Reposicao anual; a primeira licitacao fracassou por ausencia de propostas validas.\",\"prioridade\":\"alta\",\"dataPretendida\":\"28/02/2027\",\"previsaoPca\":true,\"resultados\":\"Escolas abastecidas sem compra emergencial.\",\"responsavel\":\"Helena Braga\",\"itens\":$ITENS_IMPORTADOS}"
etapa 200 "secretaria ajusta a demanda para a nova tentativa"
req compras GET "/api/processos?sugerirNumero=1"
PROC3=$(json "d['numero']")
req compras POST /api/processos "{\"numero\":\"$PROC3\",\"objeto\":\"Material de expediente 2027 (segunda tentativa)\",\"prazoLimite\":\"28/02/2027\",\"secretaria\":\"educacao\",\"solicitacaoId\":$DFD2_ID}"
etapa 201 "nova tentativa vira o processo $PROC3, com os itens de novo"

req educacao GET "/api/dfd/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$DFD','safe=' if False else ''))")"
SIT1=$(json "d['status']")
if [ "$SIT1" = "concluido" ]; then printf "  \033[32mok\033[0m   %-58s %s\n" "a demanda do processo encerrado fica concluida" "$SIT1"; else printf "  \033[31mFALHA\033[0m %-58s %s\n" "a demanda do processo encerrado fica concluida" "$SIT1"; FALHAS+=("demanda apos encerramento -> $SIT1"); fi
PASSOS=$((PASSOS+1))

echo
echo "== 15. Telas =="
for pagina in /painel/compras /painel/compras/processos /painel/compras/processo/$PROC "/painel/compras/etp/$PROC" /painel/secretario/solicitacoes /painel/compras/contratos /painel/compras/pedidos /painel/cpl /painel/prefeitura /painel/configuracoes; do
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -b $J/compras.jar "$BASE$pagina")
  case "$pagina" in /painel/cpl|/painel/prefeitura) ESPERADO=307 ;; *) ESPERADO=200 ;; esac
  etapa $ESPERADO "compras abre $pagina"
done
# O gabinete tem duas telas e so: a fila que ele decide e o contrato que a
# sustenta. O resto do fluxo nao e dele.
for pagina in /painel/compras/pedidos /painel/compras/contratos /painel/compras/processos; do
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -b $J/gabinete.jar "$BASE$pagina")
  case "$pagina" in /painel/compras/processos) ESPERADO=307 ;; *) ESPERADO=200 ;; esac
  etapa $ESPERADO "gabinete abre $pagina"
done

echo
echo "======================================================================"
if [ ${#FALHAS[@]} -eq 0 ]; then
  echo "  $PASSOS etapas, nenhuma falha."
else
  echo "  $PASSOS etapas, ${#FALHAS[@]} com falha:"
  for f in "${FALHAS[@]}"; do echo "   - $f"; done
fi
echo "======================================================================"
