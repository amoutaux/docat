/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/*
  the iFrameRef is not really compatiple with ts,
*/

import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import DocumentControlButtons from '../components/DocumentControlButtons'
import type ProjectDetails from '../models/ProjectDetails'
import ProjectRepository from '../repositories/ProjectRepository'

import LoadingPage from './LoadingPage'
import NotFound from './NotFound'

import styles from './../style/pages/Docs.module.css'
import { uniqueId } from 'lodash'
import { useMessageBanner } from '../data-providers/MessageBannerProvider'

export default function Docs (): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()

  const projectParam = useParams().project ?? ''
  const versionParam = useParams().version ?? 'latest'
  const pageParam = useParams().page ?? 'index.html'
  const hashParam = useLocation().hash.split('?')[0] ?? ''
  const hideUiParam = useSearchParams()[0].get('hide-ui') === 'true' || useLocation().hash.split('?')[1] === 'hide-ui=true'

  const [project, setProject] = useState<string>('')
  const [version, setVersion] = useState<string>('')
  const [page, setPage] = useState<string>('')
  const [hash, setHash] = useState<string>('')
  const [hideUi, setHideUi] = useState<boolean>(false)

  const [versions, setVersions] = useState<ProjectDetails[]>([])
  const [loadingFailed, setLoadingFailed] = useState<boolean>(false)

  const { showMessage } = useMessageBanner()
  const iFrameRef = useRef<HTMLIFrameElement>(null)

  const iFrame = useMemo(() => {
    return (<iframe
      ref={iFrameRef}
      key={uniqueId()}
      src={ProjectRepository.getProjectDocsURL(project, version, page, hash)}
      title="docs"
      className={styles['docs-iframe']}
      onLoad={() => {
        if (iFrameRef.current == null) {
          console.error('iFrameRef is null')
          return
        }

        // @ts-expect-error ts can't find contentWindow
        onIFrameLocationChanged(iFrameRef.current.contentWindow.location.href)
      }}
    />
    )
  }, [project, version])

  document.title = `${project} | docat`

  if (projectParam === '') {
    setLoadingFailed(true)
  }

  const updateURL = (newProject: string, newVersion: string, newPage: string, newHash: string, newHideUi: boolean, historyMode: 'push' | 'replace' | 'skip'): void => {
    const url = `/${newProject}/${newVersion}/${newPage}${newHash}${newHideUi ? '?hide-ui=true' : ''}`

    if (project === newProject && version === newVersion && page === newPage && hash === newHash && hideUi === newHideUi) {
      // no change
      return
    }

    setProject(newProject)
    setVersion(newVersion)
    setPage(newPage)
    setHash(newHash)
    setHideUi(newHideUi)

    if (historyMode === 'skip') {
      return
    }

    if (historyMode === 'replace') {
      navigate(url, { replace: true })
      return
    }

    navigate(url)
  }

  /**
   * Event listener for the hashchange event of the iframe
   * updates the url of the page to match the iframe
   */
  const hashChangeEventListener = (): void => {
    if (iFrameRef.current == null) {
      console.error('hashChangeEvent from iframe but iFrameRef is null')
      return
    }

    // @ts-expect-error - ts does not find the window on the iframe
    iFrameRef.current.contentWindow.removeEventListener('hashchange', hashChangeEventListener)

    const url = iFrameRef.current?.contentDocument?.location.href

    onIFrameLocationChanged(url)
  }

  const onIFrameLocationChanged = (url?: string): void => {
    if (url == null) {
      return
    }

    url = url.split('/doc/')[1]
    if (url == null) {
      console.error('IFrame URL did not contain "/doc/"')
      return
    }

    // make all external links in iframe open in new tab
    // @ts-expect-error - ts does not find the document on the iframe
    iFrameRef.current.contentDocument
      .querySelectorAll('a')
      .forEach((a: HTMLAnchorElement) => {
        if (!a.href.startsWith(window.location.origin)) {
          a.setAttribute('target', '_blank')
        }
      })

    const parts = url.split('/')
    const urlProject = parts[0]
    const urlVersion = parts[1]
    const urlPageAndHash = parts.slice(2).join('/')
    const hashIndex = urlPageAndHash.includes('#') ? urlPageAndHash.indexOf('#') : urlPageAndHash.length
    const urlPage = urlPageAndHash.slice(0, hashIndex)
    const urlHash = urlPageAndHash.slice(hashIndex)

    if (urlProject !== project || urlVersion !== version || urlPage !== page || urlHash !== hash) {
      updateURL(urlProject, urlVersion, urlPage, urlHash, hideUi, 'push')
    }

    // add event listener for hashchange to iframe
    // this is needed because the iframe doesn't trigger the hashchange event otherwise
    // @ts-expect-error - ts does not find the window on the iframe
    iFrameRef.current.contentWindow.addEventListener('hashchange', hashChangeEventListener)
  }

  useEffect(() => {
    if (project === '') {
      return
    }

    void (async (): Promise<void> => {
      try {
        let allVersions = await ProjectRepository.getVersions(project)

        if (allVersions.length === 0) {
          setLoadingFailed(true)
          return
        }

        allVersions = allVersions.sort((a, b) => ProjectRepository.compareVersions(a, b))
        let versionToUse = ''

        if (version === 'latest') {
          versionToUse = ProjectRepository.getLatestVersion(allVersions).name
        } else {
          // custom version -> check if it exists
          const versionsAndTags = allVersions.map((v) => [v.name, ...v.tags]).flat()
          if (!versionsAndTags.includes(version)) {
            // version does not exist -> fail
            setLoadingFailed(true)
            console.error("Version doesn't exist")
            return
          }

          versionToUse = version
        }

        updateURL(project, versionToUse, page, hash, hideUi, 'replace')
        setVersions(allVersions)
        setLoadingFailed(false)
      } catch (e) {
        console.error(e)
        setLoadingFailed(true)
      }
    })()
  }, [project])

  useEffect(() => {
    // update the state to the url params on first loadon
    if (projectParam !== project || versionParam !== version || pageParam !== page || hashParam !== hash || hideUiParam !== hideUi) {
      updateURL(projectParam, versionParam, pageParam, hashParam, hideUiParam, 'replace')
    }
  }, [location])

  useEffect(() => {
    // check every time the version changes whether the version
    // is the latest version and if not, show a banner
    if (versions.length === 0) {
      return
    }

    const latestVersion = ProjectRepository.getLatestVersion(versions).name
    if (version === latestVersion) {
      return
    }

    showMessage({
      content: 'You are viewing an outdated version of the documentation.',
      type: 'warning',
      showMs: null
    })
  }, [version, versions])

  useEffect(() => {
    const popstateListener = (): void => {
      // Somehow clicking back once isn't enough, so we do it twice automatically.
      window.history.back()
      updateURL(projectParam, versionParam, pageParam, hashParam, hideUiParam, 'skip')
    }

    window.addEventListener('popstate', popstateListener)

    return (): void => {
      window.removeEventListener('popstate', popstateListener)
    }
  }, [])

  if (loadingFailed) {
    return <NotFound />
  }

  if (versions.length === 0) {
    return <LoadingPage />
  }

  return (
    <>
      {iFrame}
      {!hideUi && (
        <DocumentControlButtons
          version={version}
          versions={versions}
          onVersionChange={(v) => { updateURL(project, v, page, hash, hideUi, 'push') }}
          onHideUi={() => { updateURL(project, version, page, hash, true, 'push') }}
        />
      )}
    </>
  )
}
