import React from 'react';
import styles from './CatalogInspectorGrid.module.less';

type SectionTab = {
  key: string;
  label: string;
};

type MetadataSectionTabsProps = {
  tabs: SectionTab[];
  activeKey: string;
  onChange: (key: string) => void;
};

const MetadataSectionTabs: React.FC<MetadataSectionTabsProps> = ({
  tabs,
  activeKey,
  onChange,
}) => (
  <div className={styles.sectionTabs}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        className={
          tab.key === activeKey ? styles.sectionTabActive : styles.sectionTab
        }
        onClick={() => onChange(tab.key)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default MetadataSectionTabs;
