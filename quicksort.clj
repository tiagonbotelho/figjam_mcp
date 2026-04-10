(defn quicksort [coll]
  (if (< (count coll) 2)
    coll
    (let [pivot (first coll)
          rest  (rest coll)
          less  (filter #(<= % pivot) rest)
          greater (filter #(> % pivot) rest)]
      (concat (quicksort less) [pivot] (quicksort greater)))))

(println (quicksort [3 6 8 10 1 2 1]))
