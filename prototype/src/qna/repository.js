import { createLocalRepository, isQnaLocalData } from "@/data/localRepository"
import { initialNotifications, initialPosts } from "@/qna/data"

export const qnaRepository = createLocalRepository({
  key: "qna",
  seed: {
    posts: initialPosts,
    notifications: initialNotifications,
    history: [],
  },
  validate: isQnaLocalData,
})
