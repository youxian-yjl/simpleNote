class NoteManager {
    constructor() {
        this.categories = [];
        this.notes = [];
        this.currentCategoryId = 'all';
        this.selectedNoteId = null;
        this.editingNoteId = null;
        this.isEditing = false;
        this.editingCategoryId = null;
        
        this.init();
    }

    migrateData() {
        // 检查是否需要迁移
        const needsMigration = !this.categories.some(c => c.id === 'recently_deleted');
        
        if (needsMigration) {
            console.log('执行数据迁移：添加回收站分类');
            
            // 添加回收站分类
            this.categories.push({
                id: 'recently_deleted',
                name: '最近删除',
                notes: [],
                isDefault: true
            });
            
            // 重新排序
            this.categories.sort((a, b) => {
                const order = ['all', 'uncategorized', 'recently_deleted'];
                const aIndex = order.indexOf(a.id);
                const bIndex = order.indexOf(b.id);
                return aIndex - bIndex;
            });
            
            // 保存迁移后的数据
            this.saveData();
            console.log('数据迁移完成');
        }
    }
    
    init() {
        this.loadData();
        this.migrateData();
        this.setupEventListeners();
        this.updateCurrentTime();
        this.renderCategories();
        this.renderNotes();
        this.updateStats();
        
        // 设置时间更新定时器
        setInterval(() => this.updateCurrentTime(), 60000);
    }
    
    // 数据存储结构
    getDataStructure() {
        return {
            categories: [
                { id: 'all', name: '全部笔记', notes: [], isDefault: true },
                { id: 'uncategorized', name: '未分类', notes: [], isDefault: true },
                { id: 'recently_deleted', name: '最近删除', notes: [], isDefault: true }
            ],
            notes: []
        };
    }
    
    loadData() {
        const savedData = localStorage.getItem('noteManagerData');
        
        // 重置数据标志
        let shouldResetData = false;
        
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.categories = data.categories || [];
                this.notes = data.notes || [];
                
                console.log('加载的数据分类:', this.categories);
                
                // 检查并添加缺失的默认分类
                const defaultCategories = [
                    { id: 'all', name: '全部笔记', notes: [], isDefault: true },
                    { id: 'uncategorized', name: '未分类', notes: [], isDefault: true },
                    { id: 'recently_deleted', name: '最近删除', notes: [], isDefault: true }
                ];
                
                // 确保所有默认分类都存在
                defaultCategories.forEach(defaultCat => {
                    const existingCat = this.categories.find(c => c.id === defaultCat.id);
                    if (!existingCat) {
                        console.log('添加缺失的分类:', defaultCat.name);
                        this.categories.push({ ...defaultCat });
                        shouldResetData = true;
                    } else {
                        // 确保已有分类的isDefault属性正确
                        existingCat.isDefault = true;
                    }
                });
                
                // 确保分类按正确顺序排列
                this.categories.sort((a, b) => {
                    const order = ['all', 'uncategorized', 'recently_deleted'];
                    const aIndex = order.indexOf(a.id);
                    const bIndex = order.indexOf(b.id);
                    
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return 0;
                });
                
                if (shouldResetData) {
                    console.log('数据已更新，正在保存...');
                    this.saveData();
                }
                
            } catch (error) {
                console.error('加载数据失败:', error);
                this.resetData();
            }
        } else {
            console.log('无保存数据，使用默认结构');
            this.resetData();
        }
    }
    
    resetData() {
        const data = this.getDataStructure();
        this.categories = data.categories;
        this.notes = data.notes;
        this.saveData();
    }
    
    saveData() {
        const data = {
            categories: this.categories,
            notes: this.notes
        };
        localStorage.setItem('noteManagerData', JSON.stringify(data));
        this.updateSavedCount();
    }
    
    // 分类管理
    createCategory(name) {
        if (!name || name.trim() === '') {
            this.showError('categoryError', '分类名称不能为空');
            return false;
        }
        
        if (this.categories.find(c => c.name === name.trim())) {
            this.showError('categoryError', '分类名称已存在');
            return false;
        }
        
        const newCategory = {
            id: 'cat_' + Date.now(),
            name: name.trim(),
            notes: [],
            isDefault: false
        };
        
        this.categories.push(newCategory);
        this.saveData();
        this.renderCategories();
        this.clearError('categoryError');
        return true;
    }
    
    updateCategory(id, newName) {
        if (!newName || newName.trim() === '') return false;
        
        const category = this.categories.find(c => c.id === id);
        if (category && !category.isDefault) {
            category.name = newName.trim();
            this.saveData();
            this.renderCategories();
            return true;
        }
        return false;
    }
    
    deleteCategory(id) {
        const category = this.categories.find(c => c.id === id);
        if (!category || category.isDefault) return false;
        
        // 将分类下的笔记移动到"未分类"
        category.notes.forEach(noteId => {
            const note = this.notes.find(n => n.id === noteId);
            if (note) {
                note.categoryId = 'uncategorized';
            }
        });
        
        // 更新"未分类"的笔记列表
        const uncategorized = this.categories.find(c => c.id === 'uncategorized');
        if (uncategorized) {
            uncategorized.notes = this.notes
                .filter(n => n.categoryId === 'uncategorized')
                .map(n => n.id);
        }
        
        // 删除分类
        this.categories = this.categories.filter(c => c.id !== id);
        this.saveData();
        
        if (this.currentCategoryId === id) {
            this.currentCategoryId = 'all';
        }
        
        this.renderCategories();
        this.renderNotes();
        return true;
    }
    
    // 笔记管理
    createNote(title, content, categoryId = 'uncategorized') {
        if (!title || title.trim() === '') {
            this.showError('titleError', '笔记标题不能为空');
            return false;
        }
        
        const now = new Date().toISOString();
        const newNote = {
            id: 'note_' + Date.now(),
            title: title.trim(),
            content: content || '',
            createdAt: now,
            modifiedAt: now,
            categoryId: categoryId
        };
        
        this.notes.push(newNote);
        
        // 更新对应分类的笔记列表
        const category = this.categories.find(c => c.id === categoryId);
        if (category) {
            category.notes.push(newNote.id);
        }
        
        this.saveData();
        this.renderNotes();
        this.renderCategories();
        this.clearError('titleError');
        return newNote;
    }
    
    updateNote(id, title, content) {
        if (!title || title.trim() === '') {
            this.showError('titleError', '笔记标题不能为空');
            return false;
        }
        
        const note = this.notes.find(n => n.id === id);
        if (note) {
            note.title = title.trim();
            note.content = content || '';
            note.modifiedAt = new Date().toISOString();
            this.saveData();
            this.renderNotes();
            this.clearError('titleError');
            return true;
        }
        return false;
    }
    
    deleteNote(id, permanent = false) {
        console.log('=== 删除操作 ===');
        console.log('笔记ID:', id, '永久删除:', permanent);
        
        const noteIndex = this.notes.findIndex(n => n.id === id);
        if (noteIndex === -1) {
            console.log('笔记不存在');
            return false;
        }
        
        const note = this.notes[noteIndex];
        
        if (!permanent) {
            // 假删：移动到回收站
            console.log('执行假删（移动到回收站）');
            
            // 保存原始分类
            const oldCategoryId = note.categoryId;
            
            // 找到原分类和回收站
            const oldCategory = this.categories.find(c => c.id === oldCategoryId);
            const recycleBin = this.categories.find(c => c.id === 'recently_deleted');
            
            if (oldCategory && recycleBin) {
                // 1. 从原分类移除
                oldCategory.notes = oldCategory.notes.filter(noteId => noteId !== id);
                
                // 2. 更新笔记信息
                note.originalCategoryId = oldCategoryId;
                note.categoryId = 'recently_deleted';
                note.deletedAt = new Date().toISOString();
                
                // 3. 添加到回收站
                if (!recycleBin.notes.includes(id)) {
                    recycleBin.notes.push(id);
                }
                
                // 4. 保存数据
                this.saveData();
                
                // 5. 更新界面状态
                if (this.selectedNoteId === id) {
                    this.selectedNoteId = null;
                    this.clearEditor();
                }
                
                // 6. 重新渲染
                this.renderCategories();
                this.renderNotes();
                
                console.log('✅ 假删成功：笔记已移动到回收站');
                return true;
            }
            
            console.log('❌ 假删失败：分类未找到');
            return false;
            
        } else {
            // 真删：永久删除
            console.log('执行真删（永久删除）');
            
            // 从分类中移除
            const category = this.categories.find(c => c.id === note.categoryId);
            if (category) {
                category.notes = category.notes.filter(noteId => noteId !== id);
            }
            
            // 从笔记列表中删除
            this.notes.splice(noteIndex, 1);
            
            this.saveData();
            
            if (this.selectedNoteId === id) {
                this.selectedNoteId = null;
                this.clearEditor();
            }

            this.renderCategories();
            this.renderNotes();
            
            console.log('✅ 真删成功：笔记已永久删除');
            return true;
        }
    }

    restoreNote(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note || note.categoryId !== 'recently_deleted') return false;
        
        const recycleBin = this.categories.find(c => c.id === 'recently_deleted');
        const targetCategory = this.categories.find(c => c.id === note.originalCategoryId) || 
                              this.categories.find(c => c.id === 'uncategorized');
        
        if (recycleBin && targetCategory) {
            // 从回收站移除
            recycleBin.notes = recycleBin.notes.filter(noteId => noteId !== id);
            
            // 添加到目标分类
            note.categoryId = targetCategory.id;
            delete note.originalCategoryId;
            delete note.deletedAt;
            
            if (!targetCategory.notes.includes(id)) {
                targetCategory.notes.push(id);
            }
            
            this.saveData();
            this.renderCategories();
            this.renderNotes();
            return true;
        }
        return false;
    }

    emptyRecycleBin() {
        const recycleBin = this.categories.find(c => c.id === 'recently_deleted');
        if (!recycleBin || recycleBin.notes.length === 0) return false;
        
        if (confirm(`确定要清空回收站吗？这将永久删除 ${recycleBin.notes.length} 条笔记，无法恢复！`)) {
            // 永久删除所有回收站中的笔记
            recycleBin.notes.forEach(noteId => {
                const noteIndex = this.notes.findIndex(n => n.id === noteId);
                if (noteIndex !== -1) {
                    this.notes.splice(noteIndex, 1);
                }
            });
            
            // 清空回收站笔记列表
            recycleBin.notes = [];
            
            this.saveData();
            
            if (this.currentCategoryId === 'recently_deleted') {
                this.renderNotes();
            }
            
            alert('回收站已清空！');
            return true;
        }
        return false;
    }
    
    moveNote(noteId, targetCategoryId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return false;
        
        const oldCategory = this.categories.find(c => c.id === note.categoryId);
        const newCategory = this.categories.find(c => c.id === targetCategoryId);
        
        if (!oldCategory || !newCategory) return false;
        
        // 从旧分类移除
        oldCategory.notes = oldCategory.notes.filter(id => id !== noteId);
        
        // 添加到新分类
        if (!newCategory.notes.includes(noteId)) {
            newCategory.notes.push(noteId);
        }
        
        // 更新笔记的分类
        note.categoryId = targetCategoryId;
        note.modifiedAt = new Date().toISOString();
        
        this.saveData();
        this.renderCategories();
        this.renderNotes();
        return true;
    }
    
    // 搜索功能
    searchNotes(keyword) {
        if (!keyword || keyword.trim() === '') {
            this.renderNotes();
            return;
        }
        
        const searchTerm = keyword.toLowerCase().trim();
        const filteredNotes = this.notes.filter(note => 
            note.title.toLowerCase().includes(searchTerm) ||
            note.content.toLowerCase().includes(searchTerm)
        );
        
        this.renderNotes(filteredNotes);
    }
    
    // 渲染功能
    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        if (!categoryList) {
            console.error('分类列表元素未找到');
            return;
        }
        
        console.log('开始渲染分类，当前分类数:', this.categories.length);
        console.log('分类详情:', this.categories.map(c => ({id: c.id, name: c.name, notesCount: c.notes.length})));
        
        categoryList.innerHTML = '';
        
        this.categories.forEach(category => {
            const li = document.createElement('li');
            li.className = `category-item ${this.currentCategoryId === category.id ? 'active' : ''}`;
            li.dataset.id = category.id;
            
            // 为回收站添加特殊图标
            const icon = category.id === 'recently_deleted' ? 'fa-trash' : 
                        category.id === 'all' ? 'fa-list' : 'fa-folder';
            
            li.innerHTML = `
                <span class="category-name">
                    <i class="fas ${icon}"></i>
                    ${category.name}
                </span>
                <span class="category-count">(${this.getNoteCountInCategory(category.id)})</span>
                ${!category.isDefault && category.id !== 'recently_deleted' ? `
                    <div class="category-actions">
                        <button class="edit-category" title="编辑分类">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-category" title="删除分类">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            `;
            
            categoryList.appendChild(li);
        });
        
        // 更新当前分类标题
        const currentCategory = this.categories.find(c => c.id === this.currentCategoryId);
        if (currentCategory) {
            document.getElementById('currentCategory').textContent = currentCategory.name;
        }
        
        console.log('分类渲染完成');
        
        this.updateMoveModalCategories();
    }
    
    renderNotes(notesToShow = null) {
        const notesList = document.getElementById('notesList');
        if (!notesList) return;
        
        let notes = notesToShow;
        const isRecycleBin = this.currentCategoryId === 'recently_deleted';
        
        // 显示/隐藏回收站相关按钮
        const restoreBtn = document.getElementById('restoreNote');
        const emptyBtn = document.getElementById('emptyRecycleBin');
        const deleteBtn = document.getElementById('deleteSelected');
        const deleteText = document.getElementById('deleteText');
        const addNoteBtn = document.getElementById('addNote');
        
        if (isRecycleBin) {
            if (restoreBtn) restoreBtn.style.display = 'flex';
            if (emptyBtn) emptyBtn.style.display = 'flex';
            if (deleteBtn) deleteBtn.style.display = 'flex';
            if (deleteText) deleteText.textContent = '永久删除';
            if (addNoteBtn) addNoteBtn.disabled = true;
        } else {
            if (restoreBtn) restoreBtn.style.display = 'none';
            if (emptyBtn) emptyBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'flex';
            if (deleteText) deleteText.textContent = '删除';
            if (addNoteBtn) addNoteBtn.disabled = false;
        }
        
        if (!notes) {
            if (this.currentCategoryId === 'all') {
                notes = this.notes;
            } else {
                const category = this.categories.find(c => c.id === this.currentCategoryId);
                if (category) {
                    notes = this.notes.filter(note => category.notes.includes(note.id));
                } else {
                    notes = [];
                }
            }
        }
        
        if (notes.length === 0) {
            let emptyMessage = '';
            if (isRecycleBin) {
                emptyMessage = '回收站是空的';
            } else if (notesToShow) {
                emptyMessage = '没有找到相关笔记';
            } else {
                emptyMessage = '该分类下暂无笔记';
            }
            
            notesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas ${isRecycleBin ? 'fa-trash' : 'fa-sticky-note'}"></i>
                    <p>${emptyMessage}</p>
                    ${!isRecycleBin ? '<p>点击"新建笔记"按钮开始记录</p>' : ''}
                </div>
            `;
            return;
        }
        
        notesList.innerHTML = '';
        
        // 如果是回收站，显示回收站信息
        if (isRecycleBin) {
            const recycleBin = this.categories.find(c => c.id === 'recently_deleted');
            if (recycleBin && recycleBin.notes.length > 0) {
                const infoDiv = document.createElement('div');
                infoDiv.className = 'recycle-info';
                infoDiv.innerHTML = `
                    <i class="fas fa-exclamation-circle"></i>
                    回收站中的笔记将在永久删除后无法恢复。共 ${recycleBin.notes.length} 条笔记。
                `;
                notesList.appendChild(infoDiv);
            }
        }
        
        notes.forEach(note => {
            const li = document.createElement('li');
            li.className = `note-item ${this.selectedNoteId === note.id ? 'selected' : ''} ${note.categoryId === 'recently_deleted' ? 'deleted' : ''}`;
            li.dataset.id = note.id;
            
            const preview = note.content.length > 100 
                ? note.content.substring(0, 100) + '...'
                : note.content;
            
            let dateInfo = '';
            if (note.categoryId === 'recently_deleted' && note.deletedAt) {
                const deletedDate = new Date(note.deletedAt).toLocaleDateString('zh-CN');
                dateInfo = `<span class="note-date">删除于: ${deletedDate}</span>`;
            } else {
                const modifiedDate = new Date(note.modifiedAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                dateInfo = `<span class="note-date">${modifiedDate}</span>`;
            }
            
            li.innerHTML = `
                <div class="note-item-header">
                    <span class="note-title">${note.title}</span>
                    ${dateInfo}
                </div>
                <div class="note-preview">${preview}</div>
                ${note.categoryId === 'recently_deleted' ? '<div class="note-status"><i class="fas fa-trash"></i> 已删除</div>' : ''}
            `;
            
            notesList.appendChild(li);
        });
        
        this.updateNoteActions();
    }
    
    renderNoteInEditor(note) {
        if (!note) {
            this.clearEditor();
            return;
        }
        
        document.getElementById('noteTitle').value = note.title;
        document.getElementById('noteContent').value = note.content;
        
        const createdTime = new Date(note.createdAt).toLocaleString('zh-CN');
        const modifiedTime = new Date(note.modifiedAt).toLocaleString('zh-CN');
        
        document.getElementById('createdTime').textContent = createdTime;
        document.getElementById('modifiedTime').textContent = modifiedTime;
        document.getElementById('wordCount').textContent = note.content.length;
        
        this.enableEditor();
        this.isEditing = true;
    }
    
    clearEditor() {
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteContent').value = '';
        document.getElementById('createdTime').textContent = '-';
        document.getElementById('modifiedTime').textContent = '-';
        document.getElementById('wordCount').textContent = '0';
        
        this.disableEditor();
        this.clearErrors();
        this.isEditing = false;
        this.editingNoteId = null;
    }
    
    // 工具方法
    getNoteCountInCategory(categoryId) {
        if (categoryId === 'all') {
            return this.notes.length;
        }
        
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return 0;
        
        return category.notes.length;
    }
    
    updateStats() {
        document.getElementById('totalNotes').textContent = this.notes.length;
    }
    
    updateSavedCount() {
        document.getElementById('savedCount').textContent = this.notes.length;
    }
    
    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short'
        });
        document.getElementById('currentTime').textContent = timeString;
    }
    
    updateMoveModalCategories() {
        const select = document.getElementById('targetCategory');
        if (!select) return;
        
        select.innerHTML = '';
        
        this.categories.forEach(category => {
            if (category.id !== 'all' && !category.isDefault) {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            }
        });
    }
    
    updateNoteActions() {
        const hasSelection = this.selectedNoteId !== null;
        const isRecycleBin = this.currentCategoryId === 'recently_deleted';
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        
        document.getElementById('moveNote').disabled = !hasSelection || isRecycleBin;
        
        if (isRecycleBin) {
            // 回收站中的操作
            document.getElementById('restoreNote').disabled = !hasSelection;
            document.getElementById('deleteSelected').disabled = !hasSelection;
        } else {
            // 普通分类中的操作
            document.getElementById('restoreNote').disabled = true;
            document.getElementById('deleteSelected').disabled = !hasSelection;
        }
        
        // 清空回收站按钮始终可用（只要回收站不为空）
        const recycleBin = this.categories.find(c => c.id === 'recently_deleted');
        const emptyBtn = document.getElementById('emptyRecycleBin');
        if (emptyBtn && recycleBin) {
            emptyBtn.disabled = recycleBin.notes.length === 0;
        }
    }
    
    enableEditor() {
        document.getElementById('saveNote').disabled = false;
        document.getElementById('cancelEdit').disabled = false;
    }
    
    disableEditor() {
        document.getElementById('saveNote').disabled = true;
        document.getElementById('cancelEdit').disabled = true;
    }
    
    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
        }
    }
    
    clearError(elementId) {
        this.showError(elementId, '');
    }
    
    clearErrors() {
        this.clearError('titleError');
        this.clearError('contentError');
        this.clearError('categoryError');
    }

    restoreSelectedNote() {
        if (this.selectedNoteId && confirm('确定要恢复这条笔记吗？')) {
            if (this.restoreNote(this.selectedNoteId)) {
                alert('笔记已恢复！');
                this.selectedNoteId = null;
                this.clearEditor();
            }
        }
    }
    
    // 事件监听
    setupEventListeners() {
        // 分类点击
        document.getElementById('categoryList').addEventListener('click', (e) => {
            const categoryItem = e.target.closest('.category-item');
            if (!categoryItem) return;
            
            const categoryId = categoryItem.dataset.id;
            
            if (e.target.closest('.edit-category')) {
                this.editCategory(categoryId);
            } else if (e.target.closest('.delete-category')) {
                this.deleteCategory(categoryId);
            } else {
                this.currentCategoryId = categoryId;
                this.selectedNoteId = null;
                this.clearEditor();
                this.renderCategories();
                this.renderNotes();
            }
        });

        // 恢复笔记按钮
        document.getElementById('restoreNote').addEventListener('click', () => {
            if (this.selectedNoteId) {
                this.restoreSelectedNote();
            }
        });
        
        // 清空回收站按钮
        document.getElementById('emptyRecycleBin').addEventListener('click', () => {
            this.emptyRecycleBin();
        });
        
        // 笔记点击
        document.getElementById('notesList').addEventListener('click', (e) => {
            const noteItem = e.target.closest('.note-item');
            if (!noteItem) return;
            
            const noteId = noteItem.dataset.id;
            const note = this.notes.find(n => n.id === noteId);
            
            if (note) {
                this.selectedNoteId = noteId;
                this.editingNoteId = noteId;
                this.renderNotes();
                this.renderNoteInEditor(note);
                this.enableEditor();
            }
        });
        
        // 搜索功能
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchNotes(e.target.value);
        });

        
        // 添加分类按钮
        document.getElementById('addCategory').addEventListener('click', () => {
            this.openCategoryModal();
        });
        
        // 添加笔记按钮
        document.getElementById('addNote').addEventListener('click', () => {
            this.createNewNote();
        });
        
        // 移动笔记按钮
        document.getElementById('moveNote').addEventListener('click', () => {
            if (this.selectedNoteId) {
                this.openMoveModal();
            }
        });
        
        // 删除选中笔记按钮
        document.getElementById('deleteSelected').addEventListener('click', () => {
            if (this.selectedNoteId) {
                const note = this.notes.find(n => n.id === this.selectedNoteId);
                const isInRecycleBin = note && note.categoryId === 'recently_deleted';
                
                if (isInRecycleBin) {
                    // 在回收站中 - 永久删除
                    if (confirm('确定要永久删除这条笔记吗？此操作不可恢复！')) {
                        this.deleteNote(this.selectedNoteId, true);
                    }
                } else {
                    // 在普通分类中 - 移动到回收站（假删）
                    if (confirm('确定要删除这条笔记吗？笔记将移动到回收站。')) {
                        this.deleteNote(this.selectedNoteId, false);
                    }
                }
            }
        });
        
        // 保存笔记按钮
        document.getElementById('saveNote').addEventListener('click', () => {
            this.saveCurrentNote();
        });
        
        // 取消编辑按钮
        document.getElementById('cancelEdit').addEventListener('click', () => {
            this.cancelEdit();
        });
        
        // 分类模态框
        const categoryModal = document.getElementById('categoryModal');
        document.getElementById('confirmCategory').addEventListener('click', () => {
            const name = document.getElementById('categoryName').value;
            
            if (this.editingCategoryId) {
                // 编辑现有分类
                if (this.updateCategory(this.editingCategoryId, name)) {
                    this.closeModal(categoryModal);
                    this.editingCategoryId = null; // 清除编辑状态
                }
            } else {
                // 创建新分类
                if (this.createCategory(name)) {
                    this.closeModal(categoryModal);
                }
            }
        });
        
        document.getElementById('cancelCategory').addEventListener('click', () => {
            this.closeModal(categoryModal);
            this.editingCategoryId = null;
        });
        
        categoryModal.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(categoryModal));
        });
        
        // 移动模态框
        const moveModal = document.getElementById('moveModal');
        document.getElementById('confirmMove').addEventListener('click', () => {
            const targetCategoryId = document.getElementById('targetCategory').value;
            if (this.selectedNoteId && targetCategoryId) {
                this.moveNote(this.selectedNoteId, targetCategoryId);
                this.closeModal(moveModal);
            }
        });
        
        document.getElementById('cancelMove').addEventListener('click', () => {
            this.closeModal(moveModal);
        });
        
        moveModal.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal(moveModal));
        });
        
        // 主题切换
        document.getElementById('toggleTheme').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const icon = document.querySelector('#toggleTheme i');
            if (document.body.classList.contains('dark-theme')) {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        });
        
        // 字数统计
        document.getElementById('noteContent').addEventListener('input', (e) => {
            document.getElementById('wordCount').textContent = e.target.value.length;
        });
        
        // 全局模态框点击关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        });
    }
    
    // 模态框操作
    openCategoryModal(editCategoryId = null) {
        const modal = document.getElementById('categoryModal');
        const title = document.getElementById('modalTitle');
        const input = document.getElementById('categoryName');
        
        if (editCategoryId) {
            const category = this.categories.find(c => c.id === editCategoryId);
            if (category) {
                title.textContent = '编辑分类';
                input.value = category.name;
                this.editingCategoryId = editCategoryId;
            }
        } else {
            title.textContent = '添加新分类';
            input.value = '';
            this.editingCategoryId = null;
        }
        
        this.clearError('categoryError');
        modal.classList.add('active');
        input.focus();
    }
    
    openMoveModal() {
        const modal = document.getElementById('moveModal');
        modal.classList.add('active');
    }
    
    closeModal(modal) {
        modal.classList.remove('active');
        document.getElementById('categoryName').value = '';
        this.clearErrors();
        this.editingCategoryId = null;
    }
    
    editCategory(categoryId) {
        this.openCategoryModal(categoryId);
    }
    
    createNewNote() {
        this.selectedNoteId = null;
        this.editingNoteId = null;
        this.clearEditor();
        this.enableEditor();
        
        document.getElementById('noteTitle').focus();
        
        // 设置默认分类
        if (this.currentCategoryId !== 'all') {
            // 编辑器的分类会在创建时自动设置为当前选中分类
        }
    }
    
    saveCurrentNote() {
        const title = document.getElementById('noteTitle').value;
        const content = document.getElementById('noteContent').value;
        
        if (this.editingNoteId) {
            // 更新现有笔记
            if (this.updateNote(this.editingNoteId, title, content)) {
                alert('笔记保存成功！');
            }
        } else {
            // 创建新笔记
            const categoryId = this.currentCategoryId !== 'all' ? this.currentCategoryId : 'uncategorized';
            const newNote = this.createNote(title, content, categoryId);
            if (newNote) {
                this.selectedNoteId = newNote.id;
                this.editingNoteId = newNote.id;
                this.renderNotes();
                alert('笔记创建成功！');
            }
        }
    }
    
    cancelEdit() {
        if (this.editingNoteId) {
            const note = this.notes.find(n => n.id === this.editingNoteId);
            if (note) {
                this.renderNoteInEditor(note);
            }
        } else {
            this.clearEditor();
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.noteManager = new NoteManager();
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    document.getElementById('addNote').click();
                    break;
                case 's':
                    e.preventDefault();
                    document.getElementById('saveNote').click();
                    break;
                case 'f':
                    e.preventDefault();
                    document.getElementById('searchInput').focus();
                    break;
                case 'delete':
                    e.preventDefault();
                    document.getElementById('deleteSelected').click();
                    break;
            }
        }
    });
});