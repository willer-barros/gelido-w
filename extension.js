const vscode = require('vscode');

const NOME_TEMA = 'gelido-w-zero-absoluto';

// Frames da cristalização: começa branco-gelo e esfria até sumir.
const FRAMES = [
  'rgba(230, 255, 251, 0.30)',
  'rgba(0, 229, 255, 0.24)',
  'rgba(0, 229, 255, 0.14)',
  'rgba(0, 229, 255, 0.06)'
];
const PASSO_MS = 80;

let item;
let timer;
let decoracoes = [];
let animacao = null;
let cristalizacaoLigada = false;
const linhasAlteradas = new Map();

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
      } catch {}
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

// ---------- ciclo de vida ----------

function activate(context) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'gelido-w: temperatura';
  item.command = 'workbench.actions.view.problems';

  decoracoes = FRAMES.map((cor) =>
    vscode.window.createTextEditorDecorationType({ backgroundColor: cor, isWholeLine: true })
  );

  context.subscriptions.push(
    item,
    ...decoracoes,
    vscode.languages.onDidChangeDiagnostics(agendar),
    vscode.workspace.onDidChangeTextDocument(registrarMudanca),
    vscode.workspace.onDidSaveTextDocument(cristalizar),
    vscode.workspace.onDidCloseTextDocument((doc) => linhasAlteradas.delete(doc.uri.toString())),
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration('gelidoW') || ev.affectsConfiguration('workbench.colorTheme')) {
        sincronizar();
      }
    }),
    {
      dispose: () => {
        clearTimeout(timer);
        pararAnimacao();
      }
    }
  );

  sincronizar();
}

function deactivate() {}

module.exports = { activate, deactivate };