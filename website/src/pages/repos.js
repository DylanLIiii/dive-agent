import Layout from '@theme/Layout';
import styles from './repos.module.css';
import sourcesData from '../../../sources.json';

const CATEGORY_LABELS = {
  'agent-harness': { label: 'Agent 框架', description: 'Agent 框架和编排工具' },
  'agent': { label: 'Agent 应用', description: 'Agent 应用和机器人项目' },
  'agent-evaluation': { label: 'Agent 评估', description: '评估和测试框架' },
  'agent-training': { label: 'Agent 训练', description: '训练和微调工具' },
};

function RepoCard({ repo }) {
  const notesCount = repo.notes?.length || 0;
  return (
    <div className={styles.repoCard}>
      <div className={styles.repoHeader}>
        <a
          href={repo.url.replace('.git', '')}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.repoName}
        >
          {repo.name}
        </a>
        {notesCount > 0 && (
          <span className={styles.notesBadge}>{notesCount} 篇笔记</span>
        )}
      </div>
      <p className={styles.repoDesc}>{repo.description}</p>
      {notesCount > 0 && (
        <div className={styles.notesList}>
          {repo.notes.map((note, i) => {
            const noteName = note.split('/').pop().replace('.md', '');
            // 将 docs/learns/... 路径转为 /learns/... 路由
            const route = note
              .replace('docs/learns/', '/learns/')
              .replace('docs/best-choices/', '/best-choices/')
              .replace('.md', '');
            return (
              <a key={i} href={route} className={styles.noteLink}>
                {noteName}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategorySection({ categoryKey, repos }) {
  const info = CATEGORY_LABELS[categoryKey] || {
    label: categoryKey,
    description: '',
  };

  if (repos.length === 0) {
    return (
      <div className={styles.category}>
        <h2>{info.label}</h2>
        <p className={styles.categoryDesc}>{info.description}</p>
        <p className={styles.emptyHint}>暂无仓库 — 待添加</p>
      </div>
    );
  }

  return (
    <div className={styles.category}>
      <h2>
        {info.label}
        <span className={styles.categoryCount}>{repos.length}</span>
      </h2>
      <p className={styles.categoryDesc}>{info.description}</p>
      <div className={styles.repoGrid}>
        {repos.map((repo) => (
          <RepoCard key={repo.name} repo={repo} />
        ))}
      </div>
    </div>
  );
}

export default function ReposPage() {
  const { sources } = sourcesData;
  const categoryOrder = ['agent-harness', 'agent', 'agent-evaluation', 'agent-training'];

  return (
    <Layout title="仓库索引" description="Agent 相关仓库索引">
      <div className="container margin-vert--lg">
        <h1>仓库索引</h1>
        <p>
          精选 Agent 相关的开源项目，按类别组织。每个仓库的关联学习笔记可直接跳转阅读。
        </p>
        {categoryOrder.map((key) => (
          <CategorySection
            key={key}
            categoryKey={key}
            repos={sources[key] || []}
          />
        ))}
      </div>
    </Layout>
  );
}
