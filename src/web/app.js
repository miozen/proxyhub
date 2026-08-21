const { createApp } = Vue;

const SINGBOX_SCHEMA_URL = 'https://sing-box.sagernet.org/schema.json';
const MONACO_BASE_URL = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min';


const RunTable = {
  props: ['runs'],
  template: `<div class="table-wrap"><table><thead><tr><th>状态</th><th>开始时间</th><th>结果</th></tr></thead><tbody><tr v-for="run in runs" :key="run.id"><td><span class="badge" :class="run.status">{{run.status}}</span></td><td>{{new Date(run.started_at).toLocaleString()}}</td><td>{{run.error_text || summary(run.summary_json)}}</td></tr><tr v-if="!runs.length"><td colspan="3" class="empty">暂无生成记录</td></tr></tbody></table></div>`,
  methods: { summary(value) { try { const data = JSON.parse(value || '{}'); return `${data.nodes || 0} 节点 / ${data.groups || 0} 分组`; } catch { return '—'; } } }
};

createApp({
  components: { RunTable },
  data: () => ({
    user: null, csrf: '', page: 'dashboard', menuOpen: false, busy: false, notice: null,
    authMode: 'login', authForm: { username: '', password: '' },
    subscriptions: [], runs: [], users: [], templates: [], settings: {},
    singboxSettings: { region_keywords: {}, banned_keywords: '', urltest_params: { url: '', interval: '', tolerance: 150 } },
    regionKeywordText: {},
    substore: { health: {}, backend_path: '' },
    generatedUrl: '', generationResult: null, subscriptionModal: null,
    subscriptionTesting: false, subscriptionTestReport: null,
    subscriptionTests: {}, subscriptionBusy: {}, subscriptionToggles: {},
    subscriptionSaving: false, generationTesting: false, generationTestedAt: null,
    subscriptionForm: {}, regions: ['HK', 'TW', 'SG', 'JP', 'US'],
    templateForm: { id: null, name: '', content: '' },
    templateValidation: { status: 'idle', label: '等待校验', message: '选择或编辑模板后自动校验' },
    templateValidationTimer: null, templateValidationRun: 0,
    monacoEditor: null, monacoReady: false, monacoLoading: false, monacoConfigured: false,
    account: { username: '', currentPassword: '', newPassword: '' },
    nav: [
      { id: 'dashboard', label: '总览', icon: '◫' }, { id: 'subscriptions', label: '我的订阅', icon: '⌁' },
      { id: 'generation', label: '配置生成', icon: '⚡' }, { id: 'substore', label: 'Sub-Store', icon: '↻', owner: true },
      { id: 'templates', label: '模板管理', icon: '◇' },
      { id: 'users', label: '用户管理', icon: '♙', owner: true }, { id: 'system', label: '系统设置', icon: '⚙', owner: true },
      { id: 'account', label: '账户设置', icon: '◎' }
    ]
  }),
  computed: {
    isOwner() { return this.user?.role === 'owner'; },
    substoreBackendUrl() {
      return this.substore.backend_path ? `${location.origin}${this.substore.backend_path}` : '';
    },
    substoreUiUrl() {
      return this.substoreBackendUrl
        ? `/?api=${encodeURIComponent(this.substoreBackendUrl)}`
        : '/';
    },
    visibleNav() { return this.nav.filter((item) => !item.owner || this.isOwner); },
    currentNav() { return this.nav.find((item) => item.id === this.page) || this.nav[0]; },
    pageTitle() { return this.currentNav.label; },
    enabledSubs() { return this.subscriptions.filter((item) => item.enabled).length; },
    pendingUsers() { return this.users.filter((item) => item.status === 'pending').length; }
  },
  watch: {
    page() { this.refreshPage(); },
    'templateForm.content'() {
      this.syncTemplateEditor();
      this.scheduleTemplateValidation();
    }
  },
  async mounted() { await this.restore(); },
  methods: {
    async api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { 'content-type': 'application/json', ...(this.csrf && options.method && options.method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}), ...(options.headers || {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessages = {
          registration_disabled: '注册功能已关闭',
          subscription_decryption_failed: '订阅数据无法解密，请恢复原 DATA_ENCRYPTION_KEY',
          user_template_required: '请先在模板管理中创建并设为默认模板'
        };
        const error = new Error(errorMessages[data.error] || data.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return data;
    },
    flash(text, type = 'success') { this.notice = { text, type }; setTimeout(() => { if (this.notice?.text === text) this.notice = null; }, 3500); },
    setAuthenticatedUser(data) {
      this.user = data.user;
      this.csrf = data.csrf_token;
      this.account.username = data.user.username;
      this.generatedUrl = data.user.client_token
        ? `${location.origin}/api/generate?token=${encodeURIComponent(data.user.client_token)}`
        : '';
    },
    async restore() {
      try {
        const data = await this.api('/api/me');
        this.setAuthenticatedUser(data);
      } catch {
        this.user = null;
        return;
      }
      try {
        await this.loadCore();
      } catch (error) {
        this.flash(error.message, 'error');
      }
    },
    async authSubmit() {
      this.busy = true;
      try {
        const data = await this.api(`/api/auth/${this.authMode}`, { method: 'POST', body: this.authForm });
        if (this.authMode === 'register') { this.flash(data.status === 'active' ? 'Owner 创建成功，请登录' : '注册成功，等待审核'); this.authMode = 'login'; }
        else {
          const current = await this.api('/api/me');
          this.setAuthenticatedUser(current);
          this.page = 'dashboard';
          this.menuOpen = false;
          await this.loadCore();
        }
      } catch (error) { this.flash(error.message, 'error'); } finally { this.busy = false; }
    },
    async logout() { try { await this.api('/api/auth/logout', { method: 'POST' }); } finally { this.user = null; this.csrf = ''; this.page = 'dashboard'; this.menuOpen = false; } },
    async loadCore() { await Promise.all([this.loadSubscriptions(), this.loadRuns(), this.loadTemplates(), ...(this.isOwner ? [this.loadUsers(), this.loadSettings()] : [])]); },
    async refreshPage() {
      try {
        if (this.page === 'subscriptions') await this.loadSubscriptions();
        if (this.page === 'generation' || this.page === 'dashboard') await this.loadRuns();
        if (this.page === 'users' && this.isOwner) await this.loadUsers();
        if (this.page === 'templates') await this.loadTemplates();
        if (this.page === 'substore' && this.isOwner) await this.loadSubstore();
        if (this.page === 'system' && this.isOwner) await this.loadSettings();
      } catch (error) { this.flash(error.message, 'error'); }
    },
    async loadSubscriptions() { this.subscriptions = (await this.api('/api/subscriptions')).subscriptions; },
    async loadRuns() { this.runs = (await this.api('/api/generation/status')).runs; },
    async loadUsers() { this.users = (await this.api('/api/admin/users')).users; },
    async loadTemplates() {
      this.templates = (await this.api('/api/templates')).templates;
      if (!this.templateForm.id && this.templates.length) await this.selectTemplate(this.templates[0]);
      if (this.page === 'templates') this.$nextTick(() => this.initTemplateEditor());
    },
    async loadSettings() {
      const [system, singbox] = await Promise.all([
        this.api('/api/admin/settings'),
        this.api('/api/admin/singbox-settings')
      ]);
      this.settings = system.settings;
      this.singboxSettings = singbox.settings;
      this.regionKeywordText = Object.fromEntries(
        Object.entries(singbox.settings.region_keywords).map(([region, keywords]) => [region, keywords.join(', ')])
      );
      this.regions = Object.keys(singbox.settings.region_keywords);
    },
    async loadSubstore() { this.substore = await this.api('/api/admin/substore/status'); },
    async resetSubstorePath() {
      if (!confirm('确认重置 Sub-Store 后端访问路径？旧地址会立即失效，使用旧地址的前端需要改用新地址。')) return;
      const data = await this.api('/api/admin/substore/backend-path/reset', { method: 'POST' });
      this.substore.backend_path = data.backend_path;
      this.flash('Sub-Store 访问路径已重置');
    },
    editSubscription(sub = null) {
      this.subscriptionForm = sub ? JSON.parse(JSON.stringify(sub)) : { name: '', url: '', enabled: true, allowed_regions: ['HK', 'TW', 'SG', 'JP', 'US'] };
      this.subscriptionTestReport = null;
      this.subscriptionModal = true;
    },
    async saveSubscription() {
      this.subscriptionSaving = true;
      try {
        const id = this.subscriptionForm.id;
        await this.api(id ? `/api/subscriptions/${id}` : '/api/subscriptions', { method: id ? 'PUT' : 'POST', body: this.subscriptionForm });
        this.subscriptionModal = null;
        this.subscriptionTestReport = null;
        await this.loadSubscriptions();
        this.flash('订阅已保存');
      } catch (error) { this.flash(error.message, 'error'); }
      finally { this.subscriptionSaving = false; }
    },
    async removeSubscription(sub) {
      if (!confirm(`删除订阅“${sub.name}”？`)) return;
      await this.api(`/api/subscriptions/${sub.id}`, { method: 'DELETE' });
      const { [sub.id]: _removed, ...remaining } = this.subscriptionTests;
      this.subscriptionTests = remaining;
      await this.loadSubscriptions();
    },
    async testSubscription(sub) {
      this.subscriptionBusy = { ...this.subscriptionBusy, [sub.id]: true };
      try {
        const report = await this.api(`/api/subscriptions/${sub.id}/test`, { method: 'POST' });
        this.subscriptionTests = {
          ...this.subscriptionTests,
          [sub.id]: { ...report, tested_at: new Date().toISOString(), expanded: true }
        };
        this.flash(report.success ? '订阅测试完成' : report.error, report.success ? 'success' : 'error');
      } catch (error) { this.flash(error.message, 'error'); }
      finally { this.subscriptionBusy = { ...this.subscriptionBusy, [sub.id]: false }; }
    },
    toggleSubscriptionReport(sub) {
      const report = this.subscriptionTests[sub.id];
      if (report) this.subscriptionTests = {
        ...this.subscriptionTests, [sub.id]: { ...report, expanded: !report.expanded }
      };
    },
    async toggleSubscription(sub) {
      const next = !sub.enabled;
      this.subscriptionToggles = { ...this.subscriptionToggles, [sub.id]: true };
      try {
        const result = await this.api(`/api/subscriptions/${sub.id}/enabled`, {
          method: 'PUT', body: { enabled: next }
        });
        sub.enabled = result.enabled;
        this.flash(result.enabled ? '订阅已启用' : '订阅已停用');
      } catch (error) { this.flash(error.message, 'error'); }
      finally { this.subscriptionToggles = { ...this.subscriptionToggles, [sub.id]: false }; }
    },
    async testSubscriptionDraft() {
      if (!this.subscriptionForm.url) return this.flash('请先填写订阅 URL', 'error');
      this.subscriptionTesting = true;
      this.subscriptionTestReport = null;
      try {
        this.subscriptionTestReport = await this.api('/api/subscription/test', {
          method: 'POST', body: { subscription: this.subscriptionForm }
        });
        this.flash(
          this.subscriptionTestReport.success ? '订阅测试完成' : this.subscriptionTestReport.error,
          this.subscriptionTestReport.success ? 'success' : 'error'
        );
      } catch (error) { this.flash(error.message, 'error'); }
      finally { this.subscriptionTesting = false; }
    },
    async resetToken() {
      if (!confirm('确认重置客户端 Token？旧订阅地址会立即失效，所有客户端都需要改用新地址。')) return;
      const data = await this.api('/api/me/token/reset', { method: 'POST' });
      this.generatedUrl = `${location.origin}/api/generate?token=${encodeURIComponent(data.token)}`;
      this.flash('客户端 Token 已重置');
    },
    async testGeneration() {
      this.generationTesting = true;
      try {
        const result = await this.api('/api/generation/test', { method: 'POST' });
        this.generationResult = result;
        this.generationTestedAt = new Date().toISOString();
        this.flash(
          result.success ? '配置生成测试完成' : result.error,
          result.success ? (result.summary.warnings ? 'warning' : 'success') : 'error'
        );
      } catch (error) { this.flash(error.message, 'error'); }
      finally { this.generationTesting = false; }
    },
    newTemplate() {
      this.setTemplateContent('{\n  "outbounds": []\n}', { id: null, name: '新模板' });
    },
    async selectTemplate(tpl) {
      if (!tpl) return;
      const data = await this.api(`/api/templates/${tpl.id}`);
      this.setTemplateContent(JSON.stringify(data.template.content, null, 2), {
        id: data.template.id,
        name: data.template.name
      });
    },
    async cloneTemplate() {
      if (!this.templateForm.content) return this.flash('请先选择模板', 'error');
      try {
        const data = await this.api('/api/templates', {
          method: 'POST',
          body: { name: `${this.templateForm.name || '模板'} 副本`, content: JSON.parse(this.templateForm.content) }
        });
        await this.loadTemplates();
        const created = this.templates.find((tpl) => tpl.id === data.id);
        if (created) await this.selectTemplate(created);
        this.flash('模板已克隆');
      } catch (error) { this.flash(`模板无效：${error.message}`, 'error'); }
    },
    async saveTemplate() {
      try {
        const body = { name: this.templateForm.name, content: JSON.parse(this.templateForm.content) };
        const data = this.templateForm.id
          ? await this.api(`/api/templates/${this.templateForm.id}`, { method: 'PUT', body })
          : await this.api('/api/templates', { method: 'POST', body });
        await this.loadTemplates();
        const saved = this.templates.find((tpl) => tpl.id === (this.templateForm.id || data.id));
        if (saved) await this.selectTemplate(saved);
        this.flash('模板已保存');
      } catch (error) { this.flash(`模板无效：${error.message}`, 'error'); }
    },
    async deleteTemplate() {
      if (!this.templateForm.id || !confirm(`删除模板“${this.templateForm.name}”？`)) return;
      await this.api(`/api/templates/${this.templateForm.id}`, { method: 'DELETE' });
      this.setTemplateContent('', { id: null, name: '' });
      await this.loadTemplates();
      this.flash('模板已删除');
    },
    async setDefaultTemplate() {
      if (!this.templateForm.id) return this.flash('请先选择模板', 'error');
      await this.api(`/api/templates/${this.templateForm.id}/default`, { method: 'POST' });
      await this.loadTemplates();
      this.flash('默认模板已更新');
    },
    formatTemplate() {
      try { this.setTemplateContent(JSON.stringify(JSON.parse(this.templateForm.content), null, 2)); }
      catch (error) { this.flash(`模板无效：${error.message}`, 'error'); }
    },
    setTemplateContent(content, patch = {}) {
      this.templateForm = { ...this.templateForm, ...patch, content };
      this.$nextTick(() => {
        this.syncTemplateEditor();
        this.scheduleTemplateValidation(80);
      });
    },
    initTemplateEditor() {
      if (this.monacoEditor || this.monacoLoading || !window.require) {
        if (this.monacoEditor) this.$nextTick(() => this.monacoEditor.layout());
        return;
      }
      this.monacoLoading = true;
      window.require.config({ paths: { vs: `${MONACO_BASE_URL}/vs` } });
      window.require(['vs/editor/editor.main'], async () => {
        try {
          await this.configureMonaco();
          const container = document.getElementById('template-content-editor');
          if (!container || this.monacoEditor) return;
          const uri = window.monaco.Uri.parse('inmemory://proxyhub/template.singbox.json');
          const model = window.monaco.editor.createModel(this.templateForm.content || '', 'json', uri);
          this.monacoEditor = window.monaco.editor.create(container, {
            model,
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on'
          });
          model.onDidChangeContent(() => {
            const value = model.getValue();
            if (value !== this.templateForm.content) this.templateForm.content = value;
            this.scheduleTemplateValidation();
          });
          window.monaco.editor.onDidChangeMarkers((uris) => {
            if (uris.some((item) => item.toString() === uri.toString())) this.updateTemplateValidationFromMarkers();
          });
          this.monacoReady = true;
          this.scheduleTemplateValidation(80);
        } catch (error) {
          this.templateValidation = { status: 'warning', label: '编辑器降级', message: `Monaco 加载失败：${error.message}` };
        } finally {
          this.monacoLoading = false;
        }
      });
    },
    async configureMonaco() {
      if (this.monacoConfigured || !window.monaco) return;
      let schema = null;
      try {
        const response = await fetch(SINGBOX_SCHEMA_URL, { cache: 'force-cache' });
        if (response.ok) schema = await response.json();
      } catch {}
      const schemaEntry = {
        uri: SINGBOX_SCHEMA_URL,
        fileMatch: ['inmemory://proxyhub/template.singbox.json']
      };
      if (schema) schemaEntry.schema = schema;
      window.monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: false,
        trailingCommas: 'error',
        schemaValidation: 'error',
        schemas: [schemaEntry]
      });
      this.monacoConfigured = true;
    },
    syncTemplateEditor() {
      const model = this.monacoEditor?.getModel?.();
      if (model && model.getValue() !== this.templateForm.content) model.setValue(this.templateForm.content || '');
    },
    scheduleTemplateValidation(delay = 350) {
      clearTimeout(this.templateValidationTimer);
      this.templateValidationTimer = setTimeout(() => this.validateTemplateNow(), delay);
    },
    updateTemplateValidationFromMarkers() {
      const model = this.monacoEditor?.getModel?.();
      if (!model || !window.monaco) return false;
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri })
        .filter((marker) => marker.severity >= window.monaco.MarkerSeverity.Warning);
      if (!markers.length) return false;
      const first = markers[0];
      this.templateValidation = {
        status: 'error',
        label: 'Schema 未通过',
        message: `第 ${first.startLineNumber} 行：${first.message}`
      };
      return true;
    },
    async validateTemplateNow() {
      const content = String(this.templateForm.content || '').trim();
      if (!content) {
        this.templateValidation = { status: 'idle', label: '等待校验', message: '模板内容为空' };
        return false;
      }
      try { JSON.parse(content); }
      catch (error) {
        this.templateValidation = { status: 'error', label: 'JSON 未通过', message: error.message };
        return false;
      }
      if (this.updateTemplateValidationFromMarkers()) return false;
      const run = ++this.templateValidationRun;
      this.templateValidation = { status: 'checking', label: '校验中', message: '正在检查模板引用关系' };
      try {
        await this.api('/api/templates/validate', { method: 'POST', body: { content: JSON.parse(content) } });
        if (run === this.templateValidationRun) {
          this.templateValidation = { status: 'success', label: '校验通过', message: 'JSON、sing-box schema 与模板引用检查通过' };
        }
        return true;
      } catch (error) {
        if (run === this.templateValidationRun) {
          this.templateValidation = { status: 'error', label: '引用未通过', message: error.message };
        }
        return false;
      }
    },
    async userAction(item, action) { await this.api(`/api/admin/users/${item.id}/${action}`, { method: 'POST' }); await this.loadUsers(); },
    async deleteUser(item) { if (!confirm(`永久删除用户“${item.username}”？`)) return; await this.api(`/api/admin/users/${item.id}`, { method: 'DELETE' }); await this.loadUsers(); },
    async toggleGeneration(item) { await this.api(`/api/admin/users/${item.id}/generation`, { method: 'PUT', body: { enabled: !item.generation_enabled } }); await this.loadUsers(); },
    async toggleRegistration() { await this.api('/api/admin/settings/registration', { method: 'PUT', body: { enabled: !this.settings.registration_enabled } }); await this.loadSettings(); },
    async toggleGenerationCache() { await this.api('/api/admin/settings/generation-cache', { method: 'PUT', body: { enabled: !this.settings.generation_cache_fallback_enabled } }); await this.loadSettings(); },
    async saveSingboxSettings() {
      const regionKeywords = Object.fromEntries(this.regions.map((region) => [
        region,
        String(this.regionKeywordText[region] || '').split(',').map((item) => item.trim()).filter(Boolean)
      ]));
      const data = await this.api('/api/admin/singbox-settings', {
        method: 'PUT',
        body: {
          region_keywords: regionKeywords,
          banned_keywords: this.singboxSettings.banned_keywords,
          urltest_params: this.singboxSettings.urltest_params
        }
      });
      this.singboxSettings = data.settings;
      this.flash('区域匹配与测速参数已保存');
    },
    async changeUsername() { await this.api('/api/me/username', { method: 'PUT', body: { username: this.account.username } }); this.user.username = this.account.username; this.flash('用户名已更新'); },
    async changePassword() { try { await this.api('/api/me/password', { method: 'PUT', body: { current_password: this.account.currentPassword, new_password: this.account.newPassword } }); this.user = null; this.csrf = ''; this.flash('密码已修改，请重新登录'); } catch (error) { this.flash(error.message, 'error'); } },
    async copy(value) {
      if (!value) return;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(value);
        this.flash('已复制');
        return;
      } catch {}
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy_failed');
        this.flash('已复制');
      } catch {
        this.flash('浏览器未允许自动复制，请手动复制', 'error');
        window.prompt('请手动复制地址', value);
      } finally { input.remove(); }
    },
    maskUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname.slice(0,20)}…`; } catch { return '••••••'; } },
    formatTime(value) { return new Date(value).toLocaleString(); }
  }
}).mount('#app');




