# gelido-w

> Dados líquidos. Superfícies vítreas. Código a zero grau.

**gelido-w** é um tema escuro para o VS Code com personalidade fria, técnica e aquática. A paleta nasceu de uma ideia de seção herói para uma landing page de realidade aumentada: interfaces que parecem gelo fino sobre água profunda, onde a informação flui por baixo de uma camada de vidro.

---

## Paleta

| Cor | HEX | Papel no tema |
|---|---|---|
| Abismo | `#041f2a` | Fundo do editor |
| Teal | `#00c2a8` | Strings, status bar, botões |
| Ciano elétrico | `#00e5ff` | Keywords, cursor, foco, tags |
| Aço azulado | `#3a506b` | Números de linha, bordas, elementos inativos |
| Gelo | `#e6fffb` | Texto principal |

Tons derivados para dar profundidade (não fazem parte do núcleo, mas sustentam as camadas de "vidro"):

| Cor | HEX | Uso |
|---|---|---|
| Fundo profundo | `#031720` | Sidebar, painel, activity bar |
| Superfície | `#082b39` | Hover e linha atual |
| Borda glacial | `#0b3a4a` | Divisórias e guias de indentação |
| Aqua claro | `#7ff5e4` | Funções e tipos |
| Gelo azulado | `#b8f2ff` | Números e constantes |
| Névoa | `#5b7790` | Comentários |

---

## Instalação

### Teste rápido (modo desenvolvimento)

1. Clone ou baixe este repositório.
2. Abra a pasta `future-w` no VS Code.
3. Pressione **F5** para abrir uma janela de desenvolvimento com o tema carregado.
4. Na nova janela, use `Ctrl+K Ctrl+T` e escolha **future-w**.

### Instalação local

Copie a pasta para o diretório de extensões do VS Code e reinicie o editor:

- **Linux / macOS:** `~/.vscode/extensions/future-w`
- **Windows:** `%USERPROFILE%\.vscode\extensions\future-w`

Depois, ative o tema em **Preferências > Tema de Cores**.

### Empacotar como `.vsix` (opcional)

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension future-w-0.0.1.vsix
```

---

## Estrutura do projeto

```
future-w/
├── package.json
├── README.md
└── themes/
    └── future-w-color-theme.json
```

---

## Filosofia: programar no gelo

Todo programador conhece o silêncio de uma madrugada com o terminal aberto. O ruído do mundo baixa, o cursor pisca e só restam você e o problema. O gelido-w foi desenhado para esse estado.

Pense em um lago congelado. Na superfície, tudo é nítido, liso e sem excesso. Embaixo, a água segue em movimento. Um bom código funciona assim: a camada visível é limpa, legível e estável, e sob ela correm os dados, as requisições, os estados que mudam a cada instante. O tema tenta traduzir essa imagem.

- **Ciano nos keywords.** São as rachaduras luminosas no gelo, os pontos onde a estrutura da linguagem aparece com clareza: `async`, `return`, `class`. Você sabe onde pisar.
- **Teal nas strings.** O texto literal é a água visível por baixo do vidro, fluida e calma.
- **Aqua claro nas funções.** Cada chamada é uma corrente atravessando a camada de gelo, levando dados de um ponto a outro.
- **Névoa nos comentários.** Eles ficam como vapor sobre a superfície: presentes quando você precisa, discretos quando não precisa.
- **Aço azulado na estrutura.** Números de linha e bordas são a malha de congelamento, a rede silenciosa que sustenta o resto.

O frio aqui não é hostilidade. É precisão. Um compilador não tem pressa nem se emociona, e um bom *debug* acontece com a cabeça fria: você isola, observa, mede, corrige. Escolhemos cores que pedem esse tipo de atenção, sem saturação gritante e sem contraste agressivo, só o brilho certo para o olho achar o que importa.

E existe o aspecto de futuro. O nome **gelido-w** vem da ideia de uma interface que parece de outra época, daquelas telas de realidade aumentada que flutuam diante de você, translúcidas, com dados escorrendo como água por vidro. Escrever código é, no fundo, construir esse tipo de coisa: invisível para quem usa, mas cheia de fluxo por dentro.

Abra um arquivo. Deixe o cursor ciano piscar sobre o fundo profundo. Compile no frio.

---

## Personalização

Para ajustar qualquer cor sem alterar o tema original, use o `settings.json` do VS Code:

```json
{
  "workbench.colorCustomizations": {
    "[future-w]": {
      "editorCursor.foreground": "#7ff5e4"
    }
  },
  "editor.tokenColorCustomizations": {
    "[future-w]": {
      "comments": "#6f8fa8"
    }
  }
}
```

---

## Roadmap

- [ ] Variante clara (**future-w light**)
- [ ] Versão com contraste alto
- [ ] Ajustes finos para Python, TypeScript/React e Markdown
- [ ] Publicação no Marketplace

---

## Contribuindo

Sugestões de cores, correções de contraste e capturas de tela em diferentes linguagens são bem-vindas. Abra uma issue ou envie um pull request.

## Licença

MIT