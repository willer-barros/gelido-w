const vscode = require('vscode');

const TEMA_ZERO = 'gelido-w-zero-absoluto';
const TEMA_AURORA = 'gelido-w-aurora';

// No modo "auto", cada recurso só liga com o(s) tema(s) abaixo ativo(s).
const TEMAS_AUTO = {
  termometro: [TEMA_ZERO],
  cristalizacao: [TEMA_ZERO],
  botaoNevoa: [TEMA_ZERO],
  permafrost: [TEMA_AURORA],
  foco: [TEMA_AURORA]
};

let ctx; // ExtensionContext, usado para guardar progresso entre sessões

// ---------- cristalização ----------
const FRAMES = [
  'rgba(230, 255, 251, 0.30)',
  'rgba(0, 229, 255, 0.24)',
  'rgba(0, 229, 255, 0.14)',
  'rgba(0, 229, 255, 0.06)'
];
const PASSO_MS = 80;

// ---------- névoa ----------
const LINHAS_PERTO = 3;
const CHAVE_NEVOA = 'gelidoW.nevoa';
const KINDS_BLOCO = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Namespace
]);

// ---------- conquistas / permafrost ----------
const CHAVE_CONQUISTAS = 'gelidoW.conquistas';
const CHAVE_RECORDE = 'gelidoW.permafrostRecorde';
const META_PERMAFROST_MS = 10 * 60 * 1000;
const JANELA_EDICAO_MS = 60 * 1000;
const GRACA_ERRO_MS = 15 * 1000;
const TICK_PERMAFROST_MS = 5000;

const CONQUISTAS = [
  {
    id: 'permafrost',
    nome: 'Permafrost',
    descricao: '10 minutos de edição ativa sem nenhum erro'
  }
];

// ---------- foco gelado ----------
const CHAVE_SESSOES = 'gelidoW.focoSessoes';
const FOCOS_ATE_PAUSA_LONGA = 4;

// ---------- estado ----------
let item;
let timer;
let decoracoes = [];
let animacao = null;
let cristalizacaoLigada = false;
const linhasAlteradas = new Map(); // uri -> Set de números de linha

let botaoNevoa;
let nevoaLigada = false;
let timerNevoa;
let tokenNevoa = 0;
let decoNevoaPerto;
let decoNevoaLonge;
const cacheSimbolos = new Map(); // uri -> { versao, lista }

let itemPermafrost;
let timerPermafrost = null;
let sequenciaMs = 0;
let recordeMs = 0;
let ultimoTick = 0;
let ultimaEdicao = 0;
let errosDesde = 0;
const desbloqueadas = new Set();

let itemFoco;
let timerFoco = null;
let nevoaPorFoco = false;
const foco = {
  fase: 'ocioso', // 'ocioso' | 'foco' | 'pausa'
  pausado: false,
  longa: false,
  restanteMs: 0,
  fimEm: 0,
  focosNoCiclo: 0
};

// ---------- configuração ----------

const cfg = () => vscode.workspace.getConfiguration('gelidoW');

function recursoAtivo(chave) {
  const modo = cfg().get(chave, 'auto');
  if (modo === 'on') return true;
  if (modo === 'off') return false;
  const tema = vscode.workspace.getConfiguration('workbench').get('colorTheme');
  return (TEMAS_AUTO[chave] || []).includes(tema);
}

function sincronizar() {
  cristalizacaoLigada = recursoAtivo('cristalizacao');
  if (!cristalizacaoLigada) {
    linhasAlteradas.clear();
    pararAnimacao();
  }
  atualizar();
  atualizarBotaoNevoa();
  sincronizarPermafrost();
  sincronizarFoco();
}

// ---------- termômetro ----------

function contarDiagnosticos() {
  let erros = 0;
  let avisos = 0;
  for (const [, diagnosticos] of vscode.languages.getDiagnostics()) {
    for (const d of diagnosticos) {
      if (d.severity === vscode.DiagnosticSeverity.Error) erros++;
      else if (d.severity === vscode.DiagnosticSeverity.Warning) avisos++;
    }
  }
  return { erros, avisos };
}

function estadoPorTemperatura(temp) {
  if (temp <= -30) return { icone: '❄️', nome: 'Zero Absoluto' };
  if (temp <= -10) return { icone: '🧊', nome: 'Congelado' };
  if (temp <= 10) return { icone: '💧', nome: 'Gelo fino' };
  if (temp <= 25) return { icone: '💦', nome: 'Derretendo' };
  return { icone: '🔥', nome: 'Degelo crítico' };
}

function atualizar() {
  if (!recursoAtivo('termometro')) {
    item.hide();
    return;
  }

  const { erros, avisos } = contarDiagnosticos();
  const temp = Math.min(40, -40 + erros * 8 + avisos * 2);
  const estado = estadoPorTemperatura(temp);

  item.text = `${estado.icone} ${temp}°C`;
  item.tooltip = new vscode.MarkdownString(
    `**${estado.nome}**\n\nErros: ${erros}  \nAvisos: ${avisos}`
  );
  item.backgroundColor =
    temp > 25 ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
  item.show();
}

function agendar() {
  clearTimeout(timer);
  timer = setTimeout(atualizar, 250);
}

// ---------- cristalização ao salvar ----------

function registrarMudanca(ev) {
  if (!cristalizacaoLigada) return;
  if (ev.document.uri.scheme !== 'file') return;
  if (ev.contentChanges.length === 0) return;

  const chave = ev.document.uri.toString();
  let linhas = linhasAlteradas.get(chave) || new Set();

  for (const c of ev.contentChanges) {
    const novas = c.text.split('\n').length - 1;
    const removidas = c.range.end.line - c.range.start.line;
    const delta = novas - removidas;

    if (delta !== 0) {
      const deslocadas = new Set();
      for (const l of linhas) {
        deslocadas.add(l > c.range.end.line ? l + delta : l);
      }
      linhas = deslocadas;
    }

    for (let i = 0; i <= novas; i++) linhas.add(c.range.start.line + i);
  }

  linhasAlteradas.set(chave, linhas);
}

function limparFrames(editores) {
  for (const editor of editores) {
    for (const deco of decoracoes) {
      try {
        editor.setDecorations(deco, []);
      } catch {
        // editor já fechado, nada a limpar
      }
    }
  }
}

function pararAnimacao() {
  if (!animacao) return;
  animacao.timers.forEach(clearTimeout);
  limparFrames(animacao.editores);
  animacao = null;
}

function cristalizar(documento) {
  const chave = documento.uri.toString();
  const linhas = linhasAlteradas.get(chave);
  linhasAlteradas.delete(chave);

  if (!cristalizacaoLigada || !linhas || linhas.size === 0) return;
  if (vscode.workspace.getConfiguration('workbench').get('reduceMotion') === 'on') return;

  const editores = vscode.window.visibleTextEditors.filter((e) => e.document === documento);
  if (editores.length === 0) return;

  const ultima = documento.lineCount - 1;
  const ranges = [...linhas]
    .filter((l) => l >= 0 && l <= ultima)
    .map((l) => new vscode.Range(l, 0, l, 0));
  if (ranges.length === 0) return;

  pararAnimacao();

  const timers = [];
  FRAMES.forEach((_, i) => {
    timers.push(
      setTimeout(() => {
        decoracoes.forEach((deco, j) => {
          editores.forEach((e) => e.setDecorations(deco, j === i ? ranges : []));
        });
      }, i * PASSO_MS)
    );
  });
  timers.push(
    setTimeout(() => {
      limparFrames(editores);
      animacao = null;
    }, FRAMES.length * PASSO_MS)
  );

  animacao = { timers, editores };
}

// ---------- modo névoa ----------

function achatar(simbolos, saida = []) {
  for (const s of simbolos || []) {
    if (s.range) {
      saida.push({ kind: s.kind, range: s.range });
      achatar(s.children, saida);
    } else if (s.location) {
      saida.push({ kind: s.kind, range: s.location.range });
    }
  }
  return saida;
}

async function simbolosDe(documento) {
  const chave = documento.uri.toString();
  const atual = cacheSimbolos.get(chave);
  if (atual && atual.versao === documento.version) return atual.lista;

  let lista = [];
  try {
    const bruto = await vscode.commands.executeCommand(
      'vscode.executeDocumentSymbolProvider',
      documento.uri
    );
    lista = achatar(bruto);
  } catch {
    lista = [];
  }
  if (lista.length > 0) cacheSimbolos.set(chave, { versao: documento.version, lista });
  return lista;
}

function menorQueContem(lista, linha) {
  let melhor = null;
  for (const s of lista) {
    if (s.range.start.line > linha || s.range.end.line < linha) continue;
    const tamanho = s.range.end.line - s.range.start.line;
    if (!melhor || tamanho < melhor.tamanho) melhor = { range: s.range, tamanho };
  }
  return melhor ? melhor.range : null;
}

function paragrafo(documento, linha) {
  const vazia = (n) => documento.lineAt(n).isEmptyOrWhitespace;
  if (vazia(linha)) return { inicio: linha, fim: linha };

  let inicio = linha;
  let fim = linha;
  while (inicio > 0 && !vazia(inicio - 1)) inicio--;
  while (fim < documento.lineCount - 1 && !vazia(fim + 1)) fim++;
  return { inicio, fim };
}

async function descobrirBloco(documento, linha) {
  const simbolos = await simbolosDe(documento);
  const multilinha = simbolos.filter((s) => s.range.end.line > s.range.start.line);
  const preferidos = multilinha.filter((s) => KINDS_BLOCO.has(s.kind));

  const range = menorQueContem(preferidos, linha) || menorQueContem(multilinha, linha);
  if (range) return { inicio: range.start.line, fim: range.end.line };
  return paragrafo(documento, linha);
}

async function aplicarNevoa(editor, token) {
  const doc = editor.document;
  if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return;

  const linha = Math.min(editor.selection.active.line, doc.lineCount - 1);
  const bloco = await descobrirBloco(doc, linha);
  if (token !== tokenNevoa || !nevoaLigada) return;

  const ultima = doc.lineCount - 1;
  const inicio = Math.max(0, Math.min(bloco.inicio, ultima));
  const fim = Math.max(inicio, Math.min(bloco.fim, ultima));
  const faixa = (a, b) =>
    a > b ? [] : [new vscode.Range(a, 0, b, doc.lineAt(b).range.end.character)];

  editor.setDecorations(decoNevoaLonge, [
    ...faixa(0, inicio - LINHAS_PERTO - 1),
    ...faixa(fim + LINHAS_PERTO + 1, ultima)
  ]);
  editor.setDecorations(decoNevoaPerto, [
    ...faixa(Math.max(0, inicio - LINHAS_PERTO), inicio - 1),
    ...faixa(fim + 1, Math.min(ultima, fim + LINHAS_PERTO))
  ]);
}

function limparNevoa() {
  tokenNevoa++;
  for (const editor of vscode.window.visibleTextEditors) {
    try {
      editor.setDecorations(decoNevoaPerto, []);
      editor.setDecorations(decoNevoaLonge, []);
    } catch {
      // editor já fechado
    }
  }
}

function agendarNevoa() {
  clearTimeout(timerNevoa);
  if (!nevoaLigada) return;

  timerNevoa = setTimeout(async () => {
    const token = ++tokenNevoa;
    for (const editor of vscode.window.visibleTextEditors) {
      try {
        await aplicarNevoa(editor, token);
      } catch {
        // editor fechado no meio da atualização
      }
    }
  }, 90);
}

function atualizarBotaoNevoa() {
  if (!recursoAtivo('botaoNevoa')) {
    botaoNevoa.hide();
    return;
  }
  botaoNevoa.text = nevoaLigada ? '🌫️ Névoa: on' : '🌫️ Névoa: off';
  botaoNevoa.tooltip = 'Alternar modo névoa: escurece tudo, menos o bloco onde está o cursor';
  botaoNevoa.show();
}

// persistir=true guarda a escolha do usuário; false é uso automático (foco).
function definirNevoa(ligada, persistir) {
  nevoaLigada = ligada;
  if (persistir) ctx.globalState.update(CHAVE_NEVOA, ligada);
  atualizarBotaoNevoa();
  if (ligada) agendarNevoa();
  else limparNevoa();
}

function alternarNevoa() {
  nevoaPorFoco = false; // o usuário assumiu o controle
  definirNevoa(!nevoaLigada, true);
}

// ---------- conquistas e permafrost ----------

function dataLocal(ms) {
  const d = new Date(ms);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function marcarEdicao(ev) {
  if (ev.contentChanges.length === 0) return;
  const esquema = ev.document.uri.scheme;
  if (esquema === 'file' || esquema === 'untitled') ultimaEdicao = Date.now();
}

function guardarRecorde() {
  if (sequenciaMs <= recordeMs) return;
  const virouMinuto = Math.floor(sequenciaMs / 60000) > Math.floor(recordeMs / 60000);
  recordeMs = sequenciaMs;
  if (virouMinuto) ctx.globalState.update(CHAVE_RECORDE, recordeMs);
}

function desbloquear(id) {
  if (desbloqueadas.has(id)) return;
  desbloqueadas.add(id);

  const todas = ctx.globalState.get(CHAVE_CONQUISTAS, {});
  todas[id] = { em: Date.now() };
  ctx.globalState.update(CHAVE_CONQUISTAS, todas);

  const conquista = CONQUISTAS.find((c) => c.id === id);
  vscode.window
    .showInformationMessage(
      `🏔️ Conquista desbloqueada: ${conquista.nome}. ${conquista.descricao}.`,
      'Ver conquistas'
    )
    .then((acao) => {
      if (acao) vscode.commands.executeCommand('gelidoW.conquistas');
    });
}

function tickPermafrost() {
  const agora = Date.now();
  const delta = Math.min(agora - ultimoTick, 2 * TICK_PERMAFROST_MS); // ignora saltos (suspensão)
  ultimoTick = agora;

  const { erros } = contarDiagnosticos();
  if (erros > 0) {
    if (!errosDesde) errosDesde = agora;
    if (agora - errosDesde >= GRACA_ERRO_MS) sequenciaMs = 0;
  } else {
    errosDesde = 0;
    if (agora - ultimaEdicao <= JANELA_EDICAO_MS) {
      sequenciaMs += delta;
      guardarRecorde();
      if (sequenciaMs >= META_PERMAFROST_MS) desbloquear('permafrost');
    }
  }
  atualizarItemPermafrost();
}

function atualizarItemPermafrost() {
  if (!recursoAtivo('permafrost')) {
    itemPermafrost.hide();
    return;
  }
  const min = Math.floor(sequenciaMs / 60000);
  const meta = META_PERMAFROST_MS / 60000;
  itemPermafrost.text = desbloqueadas.has('permafrost')
    ? `🏔️ ${min} min`
    : `🏔️ ${min}/${meta} min`;
  itemPermafrost.tooltip = new vscode.MarkdownString(
    `**Permafrost**\n\nSequência de edição sem erros: ${min} min  \nRecorde: ${Math.floor(recordeMs / 60000)} min`
  );
  itemPermafrost.show();
}

function sincronizarPermafrost() {
  if (recursoAtivo('permafrost')) {
    if (!timerPermafrost) {
      ultimoTick = Date.now();
      errosDesde = 0;
      timerPermafrost = setInterval(tickPermafrost, TICK_PERMAFROST_MS);
    }
    atualizarItemPermafrost();
  } else {
    clearInterval(timerPermafrost);
    timerPermafrost = null;
    sequenciaMs = 0;
    itemPermafrost.hide();
  }
}

async function mostrarConquistas() {
  const todas = ctx.globalState.get(CHAVE_CONQUISTAS, {});
  const itens = CONQUISTAS.map((c) => {
    const ganha = todas[c.id];
    return {
      label: `${ganha ? '$(check)' : '$(lock)'} ${c.nome}`,
      description: ganha ? `desbloqueada em ${dataLocal(ganha.em)}` : 'bloqueada',
      detail: c.descricao
    };
  });
  itens.push({
    label: '$(info) Estatísticas',
    detail: `Recorde de sequência sem erros: ${Math.floor(recordeMs / 60000)} min · Sessões de foco hoje: ${sessoesHoje()}`
  });
  await vscode.window.showQuickPick(itens, { title: 'gelido-w: conquistas' });
}

// ---------- foco gelado ----------

function chaveDia() {
  // data local, sem toISOString (que usa UTC e pode virar o dia errado)
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function sessoesHoje() {
  const r = ctx.globalState.get(CHAVE_SESSOES);
  return r && r.dia === chaveDia() ? r.total : 0;
}

function registrarSessao() {
  ctx.globalState.update(CHAVE_SESSOES, { dia: chaveDia(), total: sessoesHoje() + 1 });
}

function duracaoMs(chave, padrao) {
  const v = Number(cfg().get(chave, padrao));
  const minutos = Number.isFinite(v) ? v : padrao;
  return Math.max(1, Math.min(180, minutos)) * 60 * 1000;
}

function formatar(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function entrarFocoNevoa() {
  if (!cfg().get('focoNevoa', true)) return;
  if (!nevoaLigada) {
    nevoaPorFoco = true;
    definirNevoa(true, false);
  }
}

function sairFocoNevoa() {
  if (!nevoaPorFoco) return;
  nevoaPorFoco = false;
  if (nevoaLigada) definirNevoa(false, false);
}

function atualizarItemFoco() {
  if (!recursoAtivo('foco')) {
    itemFoco.hide();
    return;
  }

  if (foco.fase === 'ocioso') {
    itemFoco.text = '🧊 Foco';
  } else {
    const icone = foco.pausado ? '⏸' : foco.fase === 'foco' ? '🧊' : '💧';
    itemFoco.text = `${icone} ${formatar(foco.restanteMs)}`;
  }

  const nomeFase =
    foco.fase === 'ocioso'
      ? 'Parado'
      : foco.fase === 'foco'
        ? 'Foco'
        : foco.longa
          ? 'Pausa longa'
          : 'Pausa';
  itemFoco.tooltip = new vscode.MarkdownString(
    `**Foco gelado: ${nomeFase}${foco.pausado ? ' (pausado)' : ''}**\n\nSessões de foco hoje: ${sessoesHoje()}  \nClique para abrir o menu`
  );
  itemFoco.show();
}

function garantirTimerFoco() {
  if (!timerFoco) timerFoco = setInterval(tickFoco, 1000);
}

function pararTimerFoco() {
  clearInterval(timerFoco);
  timerFoco = null;
}

function iniciarFase(fase, longa = false) {
  foco.fase = fase;
  foco.longa = longa;
  foco.pausado = false;

  const dur =
    fase === 'foco'
      ? duracaoMs('focoMinutos', 25)
      : longa
        ? duracaoMs('pausaLongaMinutos', 15)
        : duracaoMs('pausaMinutos', 5);
  foco.restanteMs = dur;
  foco.fimEm = Date.now() + dur;

  if (fase === 'foco') entrarFocoNevoa();
  else sairFocoNevoa();

  garantirTimerFoco();
  atualizarItemFoco();
}

function pararFoco(zerarCiclo = true) {
  foco.fase = 'ocioso';
  foco.pausado = false;
  foco.restanteMs = 0;
  if (zerarCiclo) foco.focosNoCiclo = 0;
  pararTimerFoco();
  sairFocoNevoa();
  atualizarItemFoco();
}

function concluirFase() {
  if (foco.fase === 'foco') {
    registrarSessao();
    foco.focosNoCiclo++;
    const longa = foco.focosNoCiclo >= FOCOS_ATE_PAUSA_LONGA;
    if (longa) foco.focosNoCiclo = 0;

    const minutos = Math.round(
      duracaoMs(longa ? 'pausaLongaMinutos' : 'pausaMinutos', longa ? 15 : 5) / 60000
    );
    iniciarFase('pausa', longa);
    vscode.window.showInformationMessage(
      `🧊 Foco concluído! ${longa ? 'Pausa longa' : 'Pausa'} de ${minutos} min. A névoa se dissipou.`
    );
  } else {
    pararFoco(false);
    vscode.window
      .showInformationMessage('💧 Pausa terminada. Pronto para outro foco?', 'Iniciar foco')
      .then((acao) => {
        if (acao && recursoAtivo('foco')) iniciarFase('foco');
      });
  }
}

function tickFoco() {
  if (foco.fase === 'ocioso' || foco.pausado) return;
  foco.restanteMs = foco.fimEm - Date.now();
  if (foco.restanteMs <= 0) {
    concluirFase();
    return;
  }
  atualizarItemFoco();
}

function alternarPausaFoco() {
  if (foco.fase === 'ocioso') {
    iniciarFase('foco');
    return;
  }
  if (foco.pausado) {
    foco.fimEm = Date.now() + foco.restanteMs;
    foco.pausado = false;
    if (foco.fase === 'foco') entrarFocoNevoa();
    garantirTimerFoco();
  } else {
    foco.restanteMs = Math.max(0, foco.fimEm - Date.now());
    foco.pausado = true;
    sairFocoNevoa();
  }
  atualizarItemFoco();
}

function pularFase() {
  if (foco.fase === 'ocioso') return;
  if (foco.fase === 'foco') iniciarFase('pausa', false); // foco pulado não conta como sessão
  else pararFoco(false);
}

function exigirFoco() {
  if (recursoAtivo('foco')) return true;
  vscode.window.showInformationMessage(
    'O Foco gelado está desligado. Ative o tema gelido-w-aurora ou defina gelidoW.foco como "on".'
  );
  return false;
}

async function menuFoco() {
  if (!exigirFoco()) return;

  const itens = [];
  if (foco.fase === 'ocioso') {
    itens.push({
      label: '$(play) Iniciar foco',
      description: `${Math.round(duracaoMs('focoMinutos', 25) / 60000)} min`,
      acao: 'alternar'
    });
  } else {
    itens.push({
      label: foco.pausado ? '$(debug-continue) Retomar' : '$(debug-pause) Pausar',
      acao: 'alternar'
    });
    itens.push({ label: '$(debug-step-over) Pular fase', acao: 'pular' });
    itens.push({ label: '$(debug-stop) Parar', acao: 'parar' });
  }
  itens.push({ label: '$(trophy) Conquistas', acao: 'conquistas' });

  const escolha = await vscode.window.showQuickPick(itens, { title: 'gelido-w: foco gelado' });
  if (!escolha) return;

  if (escolha.acao === 'alternar') alternarPausaFoco();
  else if (escolha.acao === 'pular') pularFase();
  else if (escolha.acao === 'parar') pararFoco();
  else if (escolha.acao === 'conquistas') mostrarConquistas();
}

function sincronizarFoco() {
  if (!recursoAtivo('foco') && foco.fase !== 'ocioso') pararFoco();
  atualizarItemFoco();
}

// ---------- ciclo de vida ----------

function activate(context) {
  ctx = context;

  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'gelido-w: temperatura';
  item.command = 'workbench.actions.view.problems';

  itemFoco = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  itemFoco.name = 'gelido-w: foco gelado';
  itemFoco.command = 'gelidoW.foco';

  itemPermafrost = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  itemPermafrost.name = 'gelido-w: permafrost';
  itemPermafrost.command = 'gelidoW.conquistas';

  botaoNevoa = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  botaoNevoa.name = 'gelido-w: névoa';
  botaoNevoa.command = 'gelidoW.alternarNevoa';

  decoracoes = FRAMES.map((cor) =>
    vscode.window.createTextEditorDecorationType({ backgroundColor: cor, isWholeLine: true })
  );
  decoNevoaPerto = vscode.window.createTextEditorDecorationType({ opacity: '0.55' });
  decoNevoaLonge = vscode.window.createTextEditorDecorationType({ opacity: '0.2' });

  nevoaLigada = context.globalState.get(CHAVE_NEVOA, false);
  recordeMs = context.globalState.get(CHAVE_RECORDE, 0);
  Object.keys(context.globalState.get(CHAVE_CONQUISTAS, {})).forEach((id) =>
    desbloqueadas.add(id)
  );

  context.subscriptions.push(
    item,
    itemFoco,
    itemPermafrost,
    botaoNevoa,
    ...decoracoes,
    decoNevoaPerto,
    decoNevoaLonge,
    vscode.commands.registerCommand('gelidoW.alternarNevoa', alternarNevoa),
    vscode.commands.registerCommand('gelidoW.foco', menuFoco),
    vscode.commands.registerCommand('gelidoW.focoAlternar', () => {
      if (exigirFoco()) alternarPausaFoco();
    }),
    vscode.commands.registerCommand('gelidoW.conquistas', mostrarConquistas),
    vscode.languages.onDidChangeDiagnostics(agendar),
    vscode.workspace.onDidChangeTextDocument((ev) => {
      registrarMudanca(ev);
      marcarEdicao(ev);
      agendarNevoa();
    }),
    vscode.workspace.onDidSaveTextDocument(cristalizar),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const chave = doc.uri.toString();
      linhasAlteradas.delete(chave);
      cacheSimbolos.delete(chave);
    }),
    vscode.window.onDidChangeTextEditorSelection(agendarNevoa),
    vscode.window.onDidChangeActiveTextEditor(agendarNevoa),
    vscode.window.onDidChangeVisibleTextEditors(agendarNevoa),
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration('gelidoW') || ev.affectsConfiguration('workbench.colorTheme')) {
        sincronizar();
      }
    }),
    {
      dispose: () => {
        clearTimeout(timer);
        clearTimeout(timerNevoa);
        clearInterval(timerPermafrost);
        clearInterval(timerFoco);
        pararAnimacao();
      }
    }
  );

  sincronizar();
  agendarNevoa();
}

function deactivate() {}

module.exports = { activate, deactivate };