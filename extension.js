const vscode = require('vscode');

const NOME_TEMA = 'gelido-w-zero-absoluto';

// ---------- cristalização ----------
const FRAMES = [
  'rgba(230, 255, 251, 0.30)',
  'rgba(0, 229, 255, 0.24)',
  'rgba(0, 229, 255, 0.14)',
  'rgba(0, 229, 255, 0.06)'
];
const PASSO_MS = 80;

// ---------- névoa ----------
const LINHAS_PERTO = 3; // linhas vizinhas ao bloco com névoa mais leve
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

// ---------- configuração ----------

function recursoAtivo(chave) {
  const modo = vscode.workspace.getConfiguration('gelidoW').get(chave, 'auto');
  if (modo === 'on') return true;
  if (modo === 'off') return false;
  return vscode.workspace.getConfiguration('workbench').get('colorTheme') === NOME_TEMA;
}

function sincronizar() {
  cristalizacaoLigada = recursoAtivo('cristalizacao');
  if (!cristalizacaoLigada) {
    linhasAlteradas.clear();
    pararAnimacao();
  }
  atualizar();
  atualizarBotaoNevoa();
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
      // DocumentSymbol (hierárquico)
      saida.push({ kind: s.kind, range: s.range });
      achatar(s.children, saida);
    } else if (s.location) {
      // SymbolInformation (lista plana)
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
  // Não guarda resultado vazio: o language server pode ainda estar iniciando.
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
  if (token !== tokenNevoa || !nevoaLigada) return; // chegou uma atualização mais nova

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

function alternarNevoa(context) {
  nevoaLigada = !nevoaLigada;
  context.globalState.update(CHAVE_NEVOA, nevoaLigada);
  atualizarBotaoNevoa();
  if (nevoaLigada) agendarNevoa();
  else limparNevoa();
}

// ---------- ciclo de vida ----------

function activate(context) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'gelido-w: temperatura';
  item.command = 'workbench.actions.view.problems';

  botaoNevoa = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  botaoNevoa.name = 'gelido-w: névoa';
  botaoNevoa.command = 'gelidoW.alternarNevoa';

  decoracoes = FRAMES.map((cor) =>
    vscode.window.createTextEditorDecorationType({ backgroundColor: cor, isWholeLine: true })
  );
  decoNevoaPerto = vscode.window.createTextEditorDecorationType({ opacity: '0.55' });
  decoNevoaLonge = vscode.window.createTextEditorDecorationType({ opacity: '0.2' });

  nevoaLigada = context.globalState.get(CHAVE_NEVOA, false);

  context.subscriptions.push(
    item,
    botaoNevoa,
    ...decoracoes,
    decoNevoaPerto,
    decoNevoaLonge,
    vscode.commands.registerCommand('gelidoW.alternarNevoa', () => alternarNevoa(context)),
    vscode.languages.onDidChangeDiagnostics(agendar),
    vscode.workspace.onDidChangeTextDocument(registrarMudanca),
    vscode.workspace.onDidChangeTextDocument(agendarNevoa),
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
        pararAnimacao();
      }
    }
  );

  sincronizar();
  agendarNevoa();
}

function deactivate() {}

module.exports = { activate, deactivate };