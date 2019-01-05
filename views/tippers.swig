{% extends 'layout.swig' %}

{% block title %}Tippers - Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <a href="/">home</a>
  <a href="/tippers/clear">clear</a>

  <ol>
    {% for tipper in tippers %}
      <li>{{ tipper.username }} - {{ tipper.amount }}</li>
    {% endfor %}
  </ol>
{% endblock %}
