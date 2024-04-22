import Project from './Project'
import React from 'react'

import styles from './../style/components/ProjectList.module.css'
import { type Project as ProjectType } from '../models/ProjectsResponse'

interface Props {
  projects: ProjectType[]
  onFavoriteChanged: () => void
}

export default function ProjectList(props: Props): JSX.Element {
  if (props.projects.length === 0) {
    return <></>
  }

  return (
    <div className={styles['project-list']}>
      {props.projects
        .sort((a, b) => (a.name > b.name ? 1 : -1))
        .map((project) => (
          <Project
            project={project}
            key={project.name}
            onFavoriteChanged={() => {
              props.onFavoriteChanged()
            }}
          />
        ))}
    </div>
  )
}
